import * as crypto from 'crypto';
import Encoder from './Encoder';
import ErrorCode from './ErrorCode';
import { SidetreeError } from '../../Error';
const multihashes = require('multihashes');

/**
 * Class that performs hashing operations using the multihash format.
 */
export default class Multihash {
  /**
   * Hashes the content using the hashing algorithm specified.
   */
  public static hash (content: Buffer, hashAlgorithmInMultihashCode: number): Buffer {
    const hashAlgorithm = hashAlgorithmInMultihashCode;

    let hash;
    switch (hashAlgorithm) {
      case 18: // SHA256
        hash = crypto.createHash('sha256').update(content).digest();
        break;
      default:
        throw new SidetreeError(ErrorCode.MultihashUnsupportedHashAlgorithm);
    }

    const hashAlgorithmName = multihashes.codes[hashAlgorithm];
    const multihash = multihashes.encode(hash, hashAlgorithmName);

    return multihash;
  }

  /**
   * Given a multihash, returns the code of the hash algorithm used.
   * @throws `SidetreeError` if hash algorithm used for the given multihash is unsupported.
   */
  public static getHashAlgorithmCode (multihashBuffer: Buffer): number {
    const multihash = multihashes.decode(multihashBuffer);

    // Hash algorithm must be SHA-256.
    if (multihash.code !== 18) {
      throw new SidetreeError(ErrorCode.MultihashUnsupportedHashAlgorithm);
    }

    return multihash.code;
  }

  /**
   * Verifies that the given hash is a multihash computed with the latest supported hash algorithm.
   * @throws `SidetreeError` if the given hash is not a multihash computed with the latest supported hash algorithm.
   */
  public static verifyHashComputedUsingLatestSupportedAlgorithm (hash: Buffer) {
    const latestSupportedHashAlgorithmCode = 18;
    const isLatestSupportedHashFormat = Multihash.isComputedUsingHashAlgorithm(hash, latestSupportedHashAlgorithmCode); // SHA-256.

    if (!isLatestSupportedHashFormat) {
      throw new SidetreeError(ErrorCode.MultihashNotLatestSupportedHashAlgorithm);
    }
  }

  /**
   * Encodes the given hash into a multihash with the specified hashing algorithm.
   */
  public static encode (hash: Buffer, hashAlgorithmInMultihashCode: number): Buffer {
    return multihashes.encode(hash, hashAlgorithmInMultihashCode);
  }

  /**
   * Checks if the given hash is a multihash with the expected hashing algorithm.
   */
  public static isComputedUsingHashAlgorithm (hash: Buffer, expectedHashAlgorithmInMultihashCode: number): boolean {
    try {
      const multihash = multihashes.decode(hash);
      return (multihash.code === expectedHashAlgorithmInMultihashCode);
    } catch {
      return false;
    }
  }

  /**
   * Verifies the given content against the given multihash.
   */
  public static isValidHash (encodedContent: string, encodedMultihash: string): boolean {
    try {
      const contentBuffer = Encoder.decodeAsBuffer(encodedContent);
      const multihashBuffer = Encoder.decodeAsBuffer(encodedMultihash);

      const hashAlgorithmCode = Multihash.getHashAlgorithmCode(multihashBuffer);
      const actualHashBuffer = Multihash.hash(contentBuffer, hashAlgorithmCode);

      if (Buffer.compare(actualHashBuffer, multihashBuffer) !== 0) {
        return false;
      }

      return true;
    } catch (error) {
      console.log(error);
      return false;
    }
  }
}

import * as crypto from 'crypto';
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
  public static getHashAlgorithmCode (hash: Buffer): number {
    const multihash = multihashes.decode(hash);

    // Hash algorithm must be SHA-256.
    if (multihash.code !== 18) {
      throw new SidetreeError(ErrorCode.MultihashUnsupportedHashAlgorithm);
    }

    return multihash.code;
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
  public static isValidHash (hash: Buffer, expectedHashAlgorithmInMultihashCode: number) {
    try {
      const multihash = multihashes.decode(hash);
      return (multihash.code === expectedHashAlgorithmInMultihashCode);
    } catch {
      return false;
    }
  }
}

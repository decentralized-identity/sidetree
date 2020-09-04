import * as crypto from 'crypto';
import Encoder from './Encoder';
import ErrorCode from './ErrorCode';
import JsonCanonicalizer from './util/JsonCanonicalizer';
import ProtocolParameters from './ProtocolParameters';
import SidetreeError from '../../../common/SidetreeError';

const multihashes = require('multihashes');

/**
 * Class that performs hashing operations using the multihash format.
 */
export default class Multihash {
  /**
   * Hashes the content using the hashing algorithm specified.
   * @param hashAlgorithmInMultihashCode The hashing algorithm to use. If not given, latest supported hashing algorithm will be used.
   * @returns A multihash buffer.
   */
  public static hash (content: Buffer, hashAlgorithmInMultihashCode?: number): Buffer {
    if (hashAlgorithmInMultihashCode === undefined) {
      hashAlgorithmInMultihashCode = ProtocolParameters.hashAlgorithmInMultihashCode;
    }

    const conventionalHash = this.hashAsNonMultihashBuffer(content, hashAlgorithmInMultihashCode);

    const multihash = multihashes.encode(conventionalHash, hashAlgorithmInMultihashCode);

    return multihash;
  }

  /**
   * Hashes the content using the hashing algorithm specified as a generic (non-multihash) hash.
   * @param hashAlgorithmInMultihashCode The hashing algorithm to use. If not given, latest supported hashing algorithm will be used.
   * @returns A multihash buffer.
   */
  public static hashAsNonMultihashBuffer (content: Buffer, hashAlgorithmInMultihashCode: number): Buffer {
    let hash;
    switch (hashAlgorithmInMultihashCode) {
      case 18: // SHA256
        hash = crypto.createHash('sha256').update(content).digest();
        break;
      default:
        throw new SidetreeError(ErrorCode.MultihashUnsupportedHashAlgorithm);
    }

    return hash;
  }

  /**
   * Canonicalize the given content, then double hashes the result using the latest supported hash algorithm, then encodes the multihash.
   * Mainly used for testing purposes.
   */
  public static canonicalizeThenDoubleHashThenEncode (content: object) {
    const contentBuffer = JsonCanonicalizer.canonicalizeAsBuffer(content);

    // Double hash.
    const intermediateHashBuffer = Multihash.hashAsNonMultihashBuffer(contentBuffer, ProtocolParameters.hashAlgorithmInMultihashCode);
    const multihashEncodedString = Multihash.hashThenEncode(intermediateHashBuffer, ProtocolParameters.hashAlgorithmInMultihashCode);
    return multihashEncodedString;
  }

  /**
   * Hashes the content using the hashing algorithm specified then codes the multihash buffer.
   * @param hashAlgorithmInMultihashCode The hashing algorithm to use.
   */
  public static hashThenEncode (content: Buffer, hashAlgorithmInMultihashCode: number): string {
    const multihashBuffer = Multihash.hash(content, hashAlgorithmInMultihashCode);
    const multihashEncodedString = Encoder.encode(multihashBuffer);
    return multihashEncodedString;
  }

  /**
   * Given a multihash, returns the code of the hash algorithm, and digest buffer.
   * @returns [hash algorithm code, digest buffer]
   * @throws `SidetreeError` if hash algorithm used for the given multihash is unsupported.
   */
  public static decode (multihashBuffer: Buffer): { algorithm: number, hash: Buffer } {
    const multihash = multihashes.decode(multihashBuffer);

    // Hash algorithm must be SHA-256.
    if (multihash.code !== 18) {
      throw new SidetreeError(ErrorCode.MultihashUnsupportedHashAlgorithm);
    }

    return {
      algorithm: multihash.code,
      hash: multihash.digest
    };
  }

  /**
   * Verifies that the given hash is a multihash computed using the latest supported hash algorithm known to this version of code.
   * @throws `SidetreeError` if the given hash is not a multihash computed using the latest supported hash algorithm.
   */
  public static verifyHashComputedUsingLatestSupportedAlgorithm (hash: Buffer) {
    const latestSupportedHashAlgorithmCode = 18;
    const isLatestSupportedHashFormat = Multihash.isComputedUsingHashAlgorithm(hash, latestSupportedHashAlgorithmCode); // SHA-256.

    if (!isLatestSupportedHashFormat) {
      throw new SidetreeError(ErrorCode.MultihashNotLatestSupportedHashAlgorithm);
    }
  }

  /**
   * Verifies that the given encoded hash is a multihash computed using the latest supported hash algorithm known to this version of code.
   * @throws `SidetreeError` if the given hash is not a multihash computed using the latest supported hash algorithm.
   */
  public static verifyEncodedHashIsComputedUsingLastestAlgorithm (encodedHash: string) {
    const hashBuffer = Encoder.decodeAsBuffer(encodedHash);

    Multihash.verifyHashComputedUsingLatestSupportedAlgorithm(hashBuffer);
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
  public static isValidHash (encodedContent: string | undefined, encodedMultihash: string): boolean {
    if (encodedContent === undefined) {
      return false;
    }

    try {
      const contentBuffer = Encoder.decodeAsBuffer(encodedContent);
      return Multihash.verify(contentBuffer, encodedMultihash);
    } catch (error) {
      console.log(error);
      return false;
    }
  }

  /**
   * Canonicalizes the given content object, then verifies the multihash as a "double hash"
   * (ie. the given multihash is the hash of a hash) against the canonicalized string as a UTF8 buffer.
   */
  public static canonicalizeAndVerifyDoubleHash (content: object | undefined, encodedMultihash: string): boolean {
    if (content === undefined) {
      return false;
    }

    try {
      const contentBuffer = JsonCanonicalizer.canonicalizeAsBuffer(content);

      return Multihash.verifyDoubleHash(contentBuffer, encodedMultihash);
    } catch (error) {
      console.log(error);
      return false;
    }
  }

  /**
   * Verifies the multihash as a "double hash" (ie. the given multihash is a hash of a hash) against the content `Buffer`.
   * Note that the intermediate hash is required to be a non-multihash hash by the same hash algorithm as the final multihash.
   */
  private static verifyDoubleHash (content: Buffer, encodedMultihash: string): boolean {

    try {
      const expectedMultihashBuffer = Encoder.decodeAsBuffer(encodedMultihash);
      const hashAlgorithmCode = Multihash.decode(expectedMultihashBuffer).algorithm;

      const intermediateHashBuffer = Multihash.hashAsNonMultihashBuffer(content, hashAlgorithmCode);
      const actualMultihashBuffer = Multihash.hash(intermediateHashBuffer, hashAlgorithmCode);

      return Buffer.compare(actualMultihashBuffer, expectedMultihashBuffer) === 0;
    } catch (error) {
      console.log(error);
      return false;
    }
  }

  /**
   * Verifies the multihash against the content `Buffer`.
   */
  private static verify (content: Buffer, encodedMultihash: string): boolean {

    try {
      const expectedMultihashBuffer = Encoder.decodeAsBuffer(encodedMultihash);
      const hashAlgorithmCode = Multihash.decode(expectedMultihashBuffer).algorithm;

      const actualMultihashBuffer = Multihash.hash(content, hashAlgorithmCode);

      return Buffer.compare(actualMultihashBuffer, expectedMultihashBuffer) === 0;
    } catch (error) {
      console.log(error);
      return false;
    }
  }
}

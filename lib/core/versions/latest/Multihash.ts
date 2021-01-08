import * as crypto from 'crypto';
import Encoder from './Encoder';
import ErrorCode from './ErrorCode';
import JsonCanonicalizer from './util/JsonCanonicalizer';
import Logger from '../../../common/Logger';
import SidetreeError from '../../../common/SidetreeError';

const multihashes = require('multihashes');

/**
 * Class that performs hashing operations using the multihash format.
 */
export default class Multihash {
  /**
   * Hashes the content using the hashing algorithm specified.
   * @param hashAlgorithmInMultihashCode The hashing algorithm to use.
   * @returns A multihash buffer.
   */
  public static hash (content: Buffer, hashAlgorithmInMultihashCode: number): Buffer {
    const conventionalHash = this.hashAsNonMultihashBuffer(content, hashAlgorithmInMultihashCode);
    const multihash = multihashes.encode(conventionalHash, hashAlgorithmInMultihashCode);
    return multihash;
  }

  /**
   * Hashes the content using the hashing algorithm specified as a generic (non-multihash) hash.
   * @param hashAlgorithmInMultihashCode The hashing algorithm to use.
   * @returns A multihash buffer.
   */
  public static hashAsNonMultihashBuffer (content: Buffer, hashAlgorithmInMultihashCode: number): Buffer {
    let hash;
    switch (hashAlgorithmInMultihashCode) {
      case 18: // SHA256
        hash = crypto.createHash('sha256').update(content).digest();
        break;
      case 22: // SHA3-256
        hash = crypto.createHash('sha3-256').update(content).digest();
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
  public static canonicalizeThenHashThenEncode (content: object, hashAlgorithmInMultihashCode?: number) {
    const canonicalizedStringBuffer = JsonCanonicalizer.canonicalizeAsBuffer(content);

    if (hashAlgorithmInMultihashCode === undefined) {
      hashAlgorithmInMultihashCode = 18; // Default to SHA256.
    }

    const multihashEncodedString = Multihash.hashThenEncode(canonicalizedStringBuffer, hashAlgorithmInMultihashCode);
    return multihashEncodedString;
  }

  /**
   * Canonicalize the given content, then double hashes the result using the latest supported hash algorithm, then encodes the multihash.
   * Mainly used for testing purposes.
   */
  public static canonicalizeThenDoubleHashThenEncode (content: object) {
    const contentBuffer = JsonCanonicalizer.canonicalizeAsBuffer(content);

    // Double hash.
    const hashAlgorithmInMultihashCode = 18; // Default to SHA256.
    const intermediateHashBuffer = Multihash.hashAsNonMultihashBuffer(contentBuffer, hashAlgorithmInMultihashCode);
    const multihashEncodedString = Multihash.hashThenEncode(intermediateHashBuffer, hashAlgorithmInMultihashCode);
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

    return {
      algorithm: multihash.code,
      hash: multihash.digest
    };
  }

  /**
   * Checks if the given hash is a multihash computed using one of the supported hash algorithms.
   * @param inputContextForErrorLogging This string is used for error logging purposes only. e.g. 'document', or 'suffix data'.
   */
  public static validateHashComputedUsingSupportedHashAlgorithm (
    encodedMultihash: string,
    supportedHashAlgorithmsInMultihashCode: number[],
    inputContextForErrorLogging: string
  ) {
    const multihashBuffer = Encoder.decodeAsBuffer(encodedMultihash);

    let multihash;
    try {
      multihash = multihashes.decode(multihashBuffer);
    } catch {
      throw new SidetreeError(ErrorCode.MultihashStringNotAMultihash, `Given ${inputContextForErrorLogging} string '${encodedMultihash}' is not a multihash.`);
    }

    if (!supportedHashAlgorithmsInMultihashCode.includes(multihash.code)) {
      throw new SidetreeError(
        ErrorCode.MultihashNotSupported,
        `Given ${inputContextForErrorLogging} uses unsupported multihash algorithm with code ${multihash.code}.`
      );
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
      return Multihash.verifyEncodedMultihashForContent(contentBuffer, encodedMultihash);
    } catch (error) {
      Logger.info(error);
      return false;
    }
  }

  /**
   * Canonicalizes the given content object, then validates the multihash of the canonicalized UTF8 object buffer against the expected multihash.
   * @param inputContextForErrorLogging This string is used for error logging purposes only. e.g. 'document', or 'suffix data'.
   */
  public static validateCanonicalizeObjectHash (content: object, expectedEncodedMultihash: string, inputContextForErrorLogging: string) {
    const contentBuffer = JsonCanonicalizer.canonicalizeAsBuffer(content);
    const validHash = Multihash.verifyEncodedMultihashForContent(contentBuffer, expectedEncodedMultihash);

    if (!validHash) {
      throw new SidetreeError(
        ErrorCode.CanonicalizedObjectHashMismatch,
        `Canonicalized ${inputContextForErrorLogging} object hash does not match expected hash '${expectedEncodedMultihash}'.`
      );
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
      Logger.info(error);
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
      Logger.info(error);
      return false;
    }
  }

  /**
   * Verifies the multihash against the content `Buffer`.
   */
  public static verifyEncodedMultihashForContent (content: Buffer, encodedMultihash: string): boolean {

    try {
      const expectedMultihashBuffer = Encoder.decodeAsBuffer(encodedMultihash);
      const hashAlgorithmCode = Multihash.decode(expectedMultihashBuffer).algorithm;

      const actualMultihashBuffer = Multihash.hash(content, hashAlgorithmCode);

      // Compare the strings instead of buffers, because encoding schemes such as base64URL can allow two distinct strings to decode into the same buffer.
      // e.g. 'EiAJID5-y7rbEs7I3PPiMtwVf28LTkPFD4BWIZPCtb6AMg' and
      //      'EiAJID5-y7rbEs7I3PPiMtwVf28LTkPFD4BWIZPCtb6AMv' would decode into the same buffer.
      const actualMultihashString = Encoder.encode(actualMultihashBuffer);
      return actualMultihashString === encodedMultihash;
    } catch (error) {
      Logger.info(error);
      return false;
    }
  }
}

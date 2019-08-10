import * as crypto from 'crypto';
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
        throw new Error(`Hashing algorithm '${hashAlgorithm}' not implemented.`);
    }

    const hashAlgorithmName = multihashes.codes[hashAlgorithm];
    const multihash = multihashes.encode(hash, hashAlgorithmName);

    return multihash;
  }

  /**
   * Encodes the given hash into a multihash with the specified hashing algorithm.
   */
  public static encode (hash: Buffer, hashAlgorithmInMultihashCode: number): Buffer {
    return multihashes.encode(hash, hashAlgorithmInMultihashCode);
  }

  /**
   * Checks if the given hash is multihash formatted in one of the given accepted hash algorithms.
   */
  public static isSupportedHash (hash: Buffer, acceptedHashAlgorithms: number[]): boolean {
    try {
      const multihash = multihashes.decode(hash);
      return (acceptedHashAlgorithms.indexOf(multihash.code) >= 0);
    } catch {
      return false;
    }
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

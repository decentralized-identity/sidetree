import * as crypto from 'crypto';
const multihashes = require('multihashes');

/**
 * Class that performs hashing operations using the multihash format.
 */
export default class Multihash {
  /**
   * Hashes the content using the hashing algorithm specified by the latest protocol version.
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
   * Checks to see if the given hash is multihash formatted in one of the given accepted hash algorithms.
   */
  public static isSupportedHash (hash: Buffer, acceptedHashAlgorithms: number[]): boolean {
    try {
      const multihash = multihashes.decode(hash);
      return (acceptedHashAlgorithms.indexOf(multihash.code) >= 0);
    } catch {
      return false;
    }
  }
}

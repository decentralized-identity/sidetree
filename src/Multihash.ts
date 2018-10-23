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
}

import * as crypto from 'crypto';
import Protocol from './Protocol';
const multihashes = require('multihashes');

/**
 * Class that performs hashing operations using the multihash format.
 */
export default class Multihash {
  /**
   * Hashes the content using the hashing algorithm specified by the latest protocol version.
   */
  public static hash (content: Buffer): Buffer {
    const hashAlgorithm = Protocol.hashAlgorithmInMultihashCode;

    let hash;
    switch (hashAlgorithm) {
      case 18: // SHA256
        hash = crypto.createHash('sha256').update(content).digest();
        break;
      default:
        throw new Error(`Hashing algorithm '${hashAlgorithm}' not supported in protocol.`);
    }

    const hashAlgorithmName = multihashes.codes[hashAlgorithm];
    const multihash = multihashes.encode(hash, hashAlgorithmName);

    return multihash;
  }
}

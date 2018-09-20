import * as crypto from 'crypto';

/**
 * Class reusable cryptographic operations.
 */
export default class Cryptography {
  /**
   * SHA256 hash function.
   */
  public static sha256hash (value: Buffer): Buffer {
    return crypto.createHash('sha256').update(value).digest();
  }
}

import * as crypto from 'crypto';
import { Secp256k1CryptoSuite } from '@decentralized-identity/did-auth-jose';

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

  /**
   * Verifies that the given signature matches the given content being signed.
   * @param content Content signed.
   * @param encodedSignature Encoded signature.
   * @param publicKeyJwk The JWK object representing a SECP256K1 public-key.
   */
  public static async verifySignature (content: string, encodedSignature: string, publicKeyJwk: any): Promise<boolean> {
    const verified = await Secp256k1CryptoSuite.verify(content, encodedSignature, publicKeyJwk);
    return verified;
  }
}

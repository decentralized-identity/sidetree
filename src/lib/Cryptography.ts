import * as crypto from 'crypto';
import { EcPrivateKey, Secp256k1CryptoSuite } from '@decentralized-identity/did-auth-jose';

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
   * Generates a random pair of SECP256K1 public-private key-pair in JWK format.
   * @returns Public key, followed by private key.
   */
  public static async generateKeyPair (keyId: string): Promise<[any, any]> {
    const privateKey = await EcPrivateKey.generatePrivateKey(keyId);
    const publicKey = privateKey.getPublicKey();

    return [publicKey, privateKey];
  }

  /**
   * Sigs the given content using the given private key.
   * @param content Content to be signed.
   * @param privateKeyJwk The JWK object representing a SECP256K1 private-key.
   */
  public static async sign (content: string, privateKeyJwk: any): Promise<string> {
    const signature = await Secp256k1CryptoSuite.sign(content, privateKeyJwk);
    return signature;
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

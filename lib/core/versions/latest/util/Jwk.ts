import { JWK } from 'jose';

/**
 * Class containing reusable JWK operations.
 */
export default class Jwk {
  /**
   * Generates SECP256K1 key pair.
   * Mainly used for testing.
   * @returns [publicKey, privateKey]
   */
  public static async generateSecp256k1KeyPair (): Promise<[any, any]> {
    const keyPair = await JWK.generate('EC', 'secp256k1');
    const publicKey = keyPair.toJWK();
    const privateKey = Object.assign({ d: keyPair.d }, publicKey);
    return [publicKey, privateKey];
  }
}

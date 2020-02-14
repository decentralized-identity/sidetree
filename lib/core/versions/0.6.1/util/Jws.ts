import Cryptography from './Cryptography';
import DidPublicKeyModel from '../models/DidPublicKeyModel';
import { PrivateKey } from '@decentralized-identity/did-auth-jose';

/**
 * Class containing reusable JWS operations.
 */
export default class Jws {
  /**
   * Verifies the JWS signature.
   * @returns true if signature is successfully verified, false otherwise.
   */
  public static async verifySignature (
    encodedProtectedHeader: string,
    encodedPayload: string,
    signature: string,
    publicKey: DidPublicKeyModel
  ): Promise<boolean> {
    // JWS Signing Input spec: ASCII(BASE64URL(UTF8(JWS Protected Header)) || '.' || BASE64URL(JWS Payload))
    const jwsSigningInput = encodedProtectedHeader + '.' + encodedPayload;
    const verified = await Cryptography.verifySignature(jwsSigningInput, signature, publicKey);
    return verified;
  }

  /**
   * Signs the given encoded protected headder and encoded payload using the given private key.
   * @param privateKey A SECP256K1 private-key either in HEX string format or JWK format.
   */
  public static async sign (encodedProtectedHeader: string, encodedPayload: string, privateKey: string | PrivateKey): Promise<string> {
    // JWS Signing Input spec: ASCII(BASE64URL(UTF8(JWS Protected Header)) || '.' || BASE64URL(JWS Payload))
    const jwsSigningInput = encodedProtectedHeader + '.' + encodedPayload;
    const signature = await Cryptography.sign(jwsSigningInput, privateKey);
    return signature;
  }
}

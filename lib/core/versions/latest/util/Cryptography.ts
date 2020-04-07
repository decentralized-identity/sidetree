import * as crypto from 'crypto';
import DidPublicKeyModel from '../models/DidPublicKeyModel';

const secp256k1 = require('secp256k1');

/**
 * Class containing reusable cryptographic operations.
 */
export default class Cryptography {
  /**
   * SHA256 hash function.
   */
  public static sha256hash (value: Buffer): Buffer {
    return crypto.createHash('sha256').update(value).digest();
  }

  /**
   * Generates a random pair of SECP256K1 public-private key-pair in HEX format.
   * @returns Public key, followed by private key.
   */
  public static async generateKeyPairHex (keyId: string): Promise<[DidPublicKeyModel, string]> {
    let privateKeyBuffer;
    do {
      privateKeyBuffer = crypto.randomBytes(32);
    } while (!secp256k1.privateKeyVerify(privateKeyBuffer));

    const privateKeyHex = privateKeyBuffer.toString('hex');

    const publicKeyBuffer = secp256k1.publicKeyCreate(privateKeyBuffer);
    const publicKeyHex = publicKeyBuffer.toString('hex');

    const didPublicKey = {
      id: keyId,
      type: 'Secp256k1VerificationKey2018',
      publicKeyHex
    };

    return [didPublicKey, privateKeyHex];
  }
}

import * as crypto from 'crypto';
import DidPublicKeyModel from '../models/DidPublicKeyModel';
import Encoder from '../Encoder';
import KeyUsage from '../KeyUsage';
import { EcPrivateKey, PrivateKey, Secp256k1CryptoSuite } from '@decentralized-identity/did-auth-jose';
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
   * Generates a random pair of SECP256K1 public-private key-pair in JWK format.
   * NOTE: The public key returned is wrapped as a DidPublicKeyModel for convenient usage.
   * @returns Public key, followed by private key.
   */
  public static async generateKeyPairJwk (keyId: string, usage: KeyUsage, controller?: string): Promise<[DidPublicKeyModel, PrivateKey]> {
    const privateKeyJwk = await EcPrivateKey.generatePrivateKey(keyId);
    const publicKeyJwk = privateKeyJwk.getPublicKey();
    const didPublicKey = {
      id: keyId,
      type: 'Secp256k1VerificationKey2018',
      controller,
      usage,
      publicKeyJwk
    };

    return [didPublicKey, privateKeyJwk];
  }

  /**
   * Generates a random pair of SECP256K1 public-private key-pair in HEX format.
   * @returns Public key, followed by private key.
   */
  public static async generateKeyPairHex (keyId: string, usage: KeyUsage): Promise<[DidPublicKeyModel, string]> {
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
      usage,
      publicKeyHex
    };

    return [didPublicKey, privateKeyHex];
  }

  /**
   * Signs the given content using the given private key.
   * @param content Content to be signed.
   * @param privateKey A SECP256K1 private-key either in HEX string format or JWK format.
   */
  public static async sign (content: string, privateKey: string | PrivateKey): Promise<string> {

    let signature;
    // This is the HEX string case.
    if (typeof privateKey === 'string') {
      const hash = Cryptography.sha256hash(Buffer.from(content));
      const privateKeyBuffer = Buffer.from(privateKey, 'hex');
      const signatureObject = secp256k1.sign(hash, privateKeyBuffer);
      signature = Encoder.encode(signatureObject.signature);
    } else {
      // This is the JWK case.
      signature = await Secp256k1CryptoSuite.sign(content, privateKey);
    }

    return signature;
  }

  /**
   * Verifies that the given signature matches the given content being signed.
   * @param content Content signed.
   * @param encodedSignature Encoded signature.
   * @param publicKey The public key to be used for verification.
   * @returns true if signature is successfully verified, false otherwise.
   */
  public static async verifySignature (content: string, encodedSignature: string, publicKey: DidPublicKeyModel): Promise<boolean> {
    try {
      if (publicKey.type !== 'Secp256k1VerificationKey2018') {
        return false;
      }

      let verified = false;
      if (publicKey.publicKeyHex !== undefined) {
        const hash = Cryptography.sha256hash(Buffer.from(content));
        const publicKeyBuffer = Buffer.from(publicKey.publicKeyHex, 'hex');
        verified = secp256k1.verify(hash, Encoder.decodeAsBuffer(encodedSignature), publicKeyBuffer);
      } else if (publicKey.publicKeyJwk !== undefined) {
        verified = await Secp256k1CryptoSuite.verify(content, encodedSignature, publicKey.publicKeyJwk);
      }

      return verified;
    } catch {
      return false;
    }
  }
}

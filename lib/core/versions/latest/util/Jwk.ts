import ErrorCode from '../ErrorCode';
import { JWK } from 'jose';
import JwkEs256k from '../../../models/JwkEs256k';
import SidetreeError from '../../../../common/SidetreeError';

/**
 * Class containing reusable JWK operations.
 */
export default class Jwk {
  /**
   * Generates SECP256K1 key pair.
   * Mainly used for testing.
   * @returns [publicKey, privateKey]
   */
  public static async generateEs256kKeyPair (): Promise<[JwkEs256k, JwkEs256k]> {
    const keyPair = await JWK.generate('EC', 'secp256k1');
    const publicKeyInternal = keyPair.toJWK();

    // Remove the auto-populated `kid` field.
    const publicKey = {
      kty: publicKeyInternal.kty,
      crv: publicKeyInternal.crv,
      x: publicKeyInternal.x,
      y: publicKeyInternal.y
    };

    const privateKey = Object.assign({ d: keyPair.d }, publicKey);
    return [publicKey, privateKey];
  }

  /**
   * Validates the given key is a SECP256K1 public key in JWK format allowed by Sidetree.
   * @throws SidetreeError if given object is not a SECP256K1 public key in JWK format allowed by Sidetree.
   */
  public static validateJwkEs256k (publicKeyJwk: any) {
    if (publicKeyJwk === undefined) {
      throw new SidetreeError(ErrorCode.JwkEs256kUndefined);
    }

    const allowedProperties = new Set(['kty', 'crv', 'x', 'y']);
    for (const property in publicKeyJwk) {
      if (!allowedProperties.has(property)) {
        throw new SidetreeError(ErrorCode.JwkEs256kHasUnknownProperty);
      }
    }

    if (publicKeyJwk.kty !== 'EC') {
      throw new SidetreeError(ErrorCode.JwkEs256kMissingOrInvalidKty);
    }

    if (publicKeyJwk.crv !== 'secp256k1') {
      throw new SidetreeError(ErrorCode.JwkEs256kMissingOrInvalidCrv);
    }

    if (typeof publicKeyJwk.x !== 'string') {
      throw new SidetreeError(ErrorCode.JwkEs256kMissingOrInvalidTypeX);
    }

    if (typeof publicKeyJwk.y !== 'string') {
      throw new SidetreeError(ErrorCode.JwkEs256kMissingOrInvalidTypeY);
    }

    // `x` and `y` need 43 Base64URL encoded bytes to contain 256 bits.
    if (publicKeyJwk.x.length !== 43) {
      throw new SidetreeError(ErrorCode.JwkEs256kHasIncorrectLengthOfX, `SECP256K1 JWK 'x' property must be 43 bytes.`);
    }

    if (publicKeyJwk.y.length !== 43) {
      throw new SidetreeError(ErrorCode.JwkEs256kHasIncorrectLengthOfY, `SECP256K1 JWK 'y' property must be 43 bytes.`);
    }
  }

  /**
   * Gets the public key given the private ES256K key.
   * Mainly used for testing purposes.
   */
  public static getEs256kPublicKey (privateKey: JwkEs256k): JwkEs256k {
    const keyCopy = Object.assign({}, privateKey);

    // Delete the private key portion.
    delete keyCopy.d;

    return keyCopy;
  }
}

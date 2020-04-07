import ErrorCode from '../ErrorCode';
import JwkEs256k from '../../../models/JwkEs256k';
import SidetreeError from '../../../../common/SidetreeError';
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
  public static validateJwkEs256k (publicKey: any) {
    if (publicKey === undefined) {
      throw new SidetreeError(ErrorCode.JwkEs256kUndefined);
    }

    const allowedProperties = new Set(['kty', 'crv', 'x', 'y']);
    for (let property in publicKey) {
      if (!allowedProperties.has(property)) {
        throw new SidetreeError(ErrorCode.JwkEs256kHasUnknownProperty);
      }
    }

    if (publicKey.kty !== 'EC') {
      throw new SidetreeError(ErrorCode.JwkEs256kMissingOrInvalidKty);
    }

    if (publicKey.crv !== 'secp256k1') {
      throw new SidetreeError(ErrorCode.JwkEs256kMissingOrInvalidCrv);
    }

    if (typeof publicKey.x !== 'string') {
      throw new SidetreeError(ErrorCode.JwkEs256kMissingOrInvalidTypeX);
    }

    if (typeof publicKey.y !== 'string') {
      throw new SidetreeError(ErrorCode.JwkEs256kMissingOrInvalidTypeY);
    }
  }
}

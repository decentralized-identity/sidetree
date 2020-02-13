/**
 * Model for representing a recovery public key in a Sidetree operation request.
 */
export default interface PublicKeyModel {
  publicKeyJwk?: any;
  publicKeyHex?: string;
}

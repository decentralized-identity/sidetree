/**
 * Model for representing a recovery public key in a Sidetree operation request.
 */
export default interface PublicKeyModel {
  publicKeyJwk?: any; // this is currently not supported nor used in code, will support in the future
  publicKeyHex?: string;
}

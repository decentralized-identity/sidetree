/**
 * Interface representing a public key inside the 'publicKey' array property of a DID Document.
 */
export default interface DidPublicKeyModel {
  id: string;
  type: string;
  controller?: string;
  publicKeyJwk?: any; // this is currently not supported nor used in code, will support in the future
  publicKeyHex?: string;
}

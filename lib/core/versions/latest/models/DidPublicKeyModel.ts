/**
 * Interface representing a public key inside the 'publicKey' array property of a DID Document.
 */
export default interface DidPublicKeyModel {
  id: string;
  type: string;
  controller: string;
  usage: string;
  publicKeyJwk?: any;
  publicKeyHex?: string;
}

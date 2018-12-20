/**
 * Interface representing a public key inside the 'publicKey' array property of a DID Document.
 */
export default interface DidPublicKey {
  id: string;
  type: string;
  owner?: string;
  publicKeyJwk?: any;
  publicKeyHex?: string;
}

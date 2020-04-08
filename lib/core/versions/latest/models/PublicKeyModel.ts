/**
 * Interface representing a public key inside the 'publicKey' array property of a DID Document.
 */
export default interface PublicKeyModel {
  id: string;
  type: string;
  jwk: any;
}

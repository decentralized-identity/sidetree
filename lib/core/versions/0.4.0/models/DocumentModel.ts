/**
 * Defines DID Document data structure used by Sidetree for basic type safety checks.
 */
export default interface DocumentModel {
  '@context': string;
  id: string;
  publicKey: {
    id: string;
    type: string;
    publicKeyJwk?: object;
    publicKeyHex?: object;
  }[];
  service: {
    type: string;
    serviceEndpoint: {
      '@context': string;
      '@type': string;
      instance: string[];
    };
  }[];
}

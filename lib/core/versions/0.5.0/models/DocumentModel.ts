import DidPublicKeyModel from './DidPublicKeyModel';

/**
 * Defines DID Document data structure used by Sidetree for basic type safety checks.
 */
export default interface DocumentModel {
  '@context': string;
  id: string;
  publicKey: DidPublicKeyModel[];
  service: {
    type: string;
    serviceEndpoint: {
      '@context': string;
      '@type': string;
      instance: string[];
    };
  }[];
}

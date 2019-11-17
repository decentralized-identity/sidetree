import DidPublicKeyModel from './DidPublicKeyModel';
import DidServiceEndpointModel from './DidServiceEndpointModel';

/**
 * Defines DID Document data structure used by Sidetree for basic type safety checks.
 */
export default interface DocumentModel {
  '@context': string;
  id?: string;
  publicKey: DidPublicKeyModel[];
  service?: DidServiceEndpointModel[];
}

import DidServiceEndpointModel from './DidServiceEndpointModel';
import PublicKeyModel from './PublicKeyModel';

/**
 * Defines INTERNAL data structure used by the `DocumentComposer` to store document state.'
 * NOTE: This model should ONLY be used by the `DocumentComposer`.
 */
export default interface DocumentModel {
  publicKeys: PublicKeyModel[];
  serviceEndpoints?: DidServiceEndpointModel[];
}

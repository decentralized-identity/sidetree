import PublicKeyModel from './PublicKeyModel';
import ServiceEndpointModel from './ServiceEndpointModel';

/**
 * Defines INTERNAL data structure used by the `DocumentComposer` to store document state.'
 * NOTE: This model should ONLY be used by the `DocumentComposer`.
 */
export default interface DocumentModel {
  public_keys?: PublicKeyModel[];
  service_endpoints?: ServiceEndpointModel[];
}

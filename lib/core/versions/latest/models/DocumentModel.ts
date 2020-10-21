import PublicKeyModel from './PublicKeyModel';
import ServiceModel from './ServiceModel';

/**
 * Defines INTERNAL data structure used by the `DocumentComposer` to store document state.'
 * NOTE: This model should ONLY be used by the `DocumentComposer`.
 */
export default interface DocumentModel {
  publicKeys?: PublicKeyModel[];
  services?: ServiceModel[];
}

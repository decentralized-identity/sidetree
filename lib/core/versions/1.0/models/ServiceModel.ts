/**
 * Defines the data structure of an element of `service` array within the DID Document used by Sidetree for basic type safety checks.
 */
export default interface ServiceModel {
  id: string;
  type: string;
  serviceEndpoint: string | object;
}

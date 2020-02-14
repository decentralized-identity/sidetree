/**
 * Defines the data structure of an element of `service` array within the DID Document used by Sidetree for basic type safety checks.
 * NOTE: The class intentionally contains "Endpoint" to disambiguate from overloaded term "Service".
 */
export default interface DidServiceEndpointModel {
  type: string;
  serviceEndpoint: {
    '@context': string;
    '@type': string;
    instances: string[]
  };
}

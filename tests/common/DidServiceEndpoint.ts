import DidServiceEndpointModel from '../../lib/core/versions/latest/models/DidServiceEndpointModel';

/**
 * DID Document service endpoint related operations.
 */
export default class DidServiceEndpoint {
  /**
   * Test if a MongoDB service is running at the specified url.
   */
  public static createHubServiceEndpoint(
    instances: string[]
  ): DidServiceEndpointModel {
    return {
      type: 'IdentityHub',
      serviceEndpoint: {
        '@context': 'schema.identity.foundation/hub',
        '@type': 'UserServiceEndpoint',
        instances: instances
      }
    };
  }
}

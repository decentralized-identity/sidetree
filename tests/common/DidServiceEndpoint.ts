import DidServiceEndpointModel from '../../lib/core/versions/latest/models/DidServiceEndpointModel';

/**
 * DID Document service endpoint related operations.
 */
export default class DidServiceEndpoint {
  /**
   * Test if a MongoDB service is running at the specified url.
   */
  public static createHubServiceEndpoint (id: string): DidServiceEndpointModel {
    return {
      id: id,
      type: 'IdentityHub',
      serviceEndpoint: 'https://www.hub.com'
    };
  }
}

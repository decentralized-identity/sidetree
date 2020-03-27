import ResponseModel from '../../common/models/ResponseModel';

/**
 * Interface that defines a class that handle requests.
 */
export default interface IRequestHandler {
  /**
   * Handles an operation request.
   */
  handleOperationRequest (request: Buffer): Promise<ResponseModel>;

  /**
   * Handles resolve operation.
   * @param didOrDidDocument Can either be:
   *   1. Fully qualified DID. e.g. 'did:sidetree:abc' or
   *   2. An encoded DID Document prefixed by the DID method name. e.g. 'did:sidetree:<encoded-DID-Document>'.
   */
  handleResolveRequest (didOrDidDocument: string): Promise<ResponseModel>;
}

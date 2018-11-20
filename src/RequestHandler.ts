import Rooter from './Rooter';
import { Blockchain } from './Blockchain';
import { DidCache } from './DidCache';
import { getProtocol } from './Protocol';
import { OperationType, WriteOperation } from './Operation';
import { Response, ResponseStatus } from './Response';

/**
 * Sidetree operation request handler.
 */
export default class RequestHandler {

  public constructor (private didCache: DidCache, private blockchain: Blockchain, private rooter: Rooter, private didMethodName: string) {
  }

  /**
   * Handles write operations.
   */
  public async handleWriteRequest (request: Buffer): Promise<Response> {
    let protocol;
    try {
      // Get the protocol version according to current blockchain time to validate the operation request.
      const currentTime = await this.blockchain.getLatestTime();
      protocol = getProtocol(currentTime.time + 1);
    } catch {
      return {
        status: ResponseStatus.ServerError
      };
    }

    // Perform common validation for any write request and parse it into a write operation.
    let operation: WriteOperation;
    try {
      // Validate operation request size.
      if (request.length > protocol.maxOperationByteSize) {
        throw new Error(`Operation byte size of ${request.length} exceeded limit of ${protocol.maxOperationByteSize}`);
      }

      // Parse request into a WriteOperation.
      operation = WriteOperation.create(request);

      // TODO: Validate or perform proof-of-work.

      // TODO: Validate signature.
    } catch {
      return {
        status: ResponseStatus.BadRequest
      };
    }

    try {
      // Passed common write operation validation, hand off to specific operation handler.
      let response: Response;
      switch (operation.type) {
        case OperationType.Create:
          response = await this.handleCreateOperation(operation);
          break;
        default:
          response = {
            status: ResponseStatus.ServerError,
            body: { error: 'Not implemented' }
          };
      }

      // if the operation was processed successfully, queue the original request buffer for batching.
      if (response.status === ResponseStatus.Succeeded) {
        this.rooter.add(request);
      }

      return response;
    } catch {
      return {
        status: ResponseStatus.ServerError
      };
    }
  }

  /**
   * Handles resolve operation.
   */
  public async handleResolveRequest (did: string): Promise<Response> {
    const didUniquePortion = did.substring(this.didMethodName.length);
    const didDocument = await this.didCache.resolve(didUniquePortion);

    if (!didDocument) {
      return {
        status: ResponseStatus.NotFound
      };
    }

    return {
      status: ResponseStatus.Succeeded,
      body: didDocument
    };
  }

  /**
   * Handles create operation.
   */
  public async handleCreateOperation (operation: WriteOperation): Promise<Response> {
    // Get the current blockchain time so the correct protocol version can be used for generating the DID.
    const currentTime = await this.blockchain.getLatestTime();

    // Construct real DID document and return it.
    const didDocument = WriteOperation.toDidDocument(operation, this.didMethodName, currentTime.time + 1);

    return {
      status: ResponseStatus.Succeeded,
      body: didDocument
    };
  }
}

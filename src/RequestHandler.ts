import Rooter from './Rooter';
import { Blockchain } from './Blockchain';
import { DidDocument } from '@decentralized-identity/did-common-typescript';
import { getProtocol } from './Protocol';
import { OperationProcessor } from './OperationProcessor';
import { OperationType, WriteOperation } from './Operation';
import { Response, ResponseStatus } from './Response';
import { ErrorCode, SidetreeError } from './Error';

/**
 * Sidetree operation request handler.
 */
export default class RequestHandler {

  public constructor (private operationProcessor: OperationProcessor, private blockchain: Blockchain, private rooter: Rooter, private didMethodName: string) {
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
        case OperationType.Update:
          response = await this.handleUpdateOperation(operation);
          break;
        case OperationType.Delete:
          response = await this.handleDeleteOperation(operation);
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
    const didDocument = await this.operationProcessor.resolve(did);

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

  /**
   * Handles update operation.
   */
  public async handleUpdateOperation (operation: WriteOperation): Promise<Response> {
    // TODO: Assert that operation is well-formed once the code reaches here.
    // ie. Need to make sure invalid patch, missing operation number, etc will cause WriteOperation creation failure.

    let updatedDidDocument;
    try {
      updatedDidDocument = await this.simulateUpdateOperation(operation);

    } catch (error) {
      if (error instanceof SidetreeError && error.errorCode === ErrorCode.DidNotFound) {
        return {
          status: ResponseStatus.BadRequest,
          body: error
        };
      }

      throw error;
    }

    return {
      status: ResponseStatus.Succeeded,
      body: updatedDidDocument
    };
  }

  /**
   * Handles update operation.
   */
  public async handleDeleteOperation (operation: WriteOperation): Promise<Response> {
    // TODO: Assert that operation is well-formed once the code reaches here.

    try {
      await this.simulateDeleteOperation(operation);
    } catch (error) {
      if (error instanceof SidetreeError && error.errorCode === ErrorCode.DidNotFound) {
        return {
          status: ResponseStatus.BadRequest,
          body: error
        };
      }

      throw error;
    }

    return {
      status: ResponseStatus.Succeeded
    };
  }

  /**
   * Simulates an Update operation without actually commiting the state change.
   * This method is used to sanity validate an write-operation request before it is batched for rooting.
   * NOTE: This method is intentionally not placed within Operation Processor because:
   * 1. This avoids to create yet another interface method.
   * 2. It is more appropriate to think of this method a higher-layer logic that uses the building blocks exposed by the Operation Processor.
   * @param operation The Update operation to be applied.
   * @returns The resultant DID Document.
   * @throws Error if operation given is invalid.
   */
  private async simulateUpdateOperation (operation: WriteOperation): Promise<DidDocument> {
    // TODO: add and refactor code such that same validation code is used by this method and anchored operation processing.

    // Get the current DID Document of the specified DID.
    const currentDidDcoument = await this.operationProcessor.resolve(operation.did!);
    if (!currentDidDcoument) {
      throw new SidetreeError(ErrorCode.DidNotFound);
    }

    // Apply the patch on top of the current DID Document.
    const updatedDidDocument = WriteOperation.applyJsonPatchToDidDocument(currentDidDcoument, operation.patch!);
    return updatedDidDocument;
  }

  private async simulateDeleteOperation (operation: WriteOperation) {
    // TODO: add and refactor code such that same validation code is used by this method and anchored operation processing.

    const currentDidDcoument = await this.operationProcessor.resolve(operation.did!);

    if (!currentDidDcoument) {
      throw new SidetreeError(ErrorCode.DidNotFound);
    }

    return;
  }
}

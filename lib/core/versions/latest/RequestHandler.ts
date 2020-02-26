import Did from './Did';
import DidResolutionModel from '../../models/DidResolutionModel';
import ErrorCode from './ErrorCode';
import IOperationQueue from './interfaces/IOperationQueue';
import IRequestHandler from '../../interfaces/IRequestHandler';
import Operation from './Operation';
import OperationModel from './models/OperationModel';
import OperationProcessor from './OperationProcessor';
import OperationType from '../../enums/OperationType';
import ProtocolParameters from './ProtocolParameters';
import Resolver from '../../Resolver';
import SidetreeError from '../../SidetreeError';
import { ResponseModel, ResponseStatus } from '../../../common/Response';

/**
 * Sidetree operation request handler.
 */
export default class RequestHandler implements IRequestHandler {

  private operationProcessor: OperationProcessor;

  public constructor (
    private resolver: Resolver,
    private operationQueue: IOperationQueue,
    private didMethodName: string) {
    this.operationProcessor = new OperationProcessor(didMethodName);
  }

  /**
   * Handles an operation request.
   */
  public async handleOperationRequest (request: Buffer): Promise<ResponseModel> {
    console.info(`Handling operation request of size ${request.length} bytes...`);

    // Perform common validation for any write request and parse it into an `OperationModel`.
    let operation: OperationModel;
    try {
      // Validate operation request size.
      if (request.length > ProtocolParameters.maxOperationByteSize) {
        const errorMessage = `Operation byte size of ${request.length} exceeded limit of ${ProtocolParameters.maxOperationByteSize}`;
        console.info(errorMessage);
        throw new SidetreeError(ErrorCode.OperationExceedsMaximumSize, errorMessage);
      }

      operation = await Operation.parse(request);

      // Reject operation if there is already an operation for the same DID waiting to be batched and anchored.
      if (await this.operationQueue.contains(operation.didUniqueSuffix)) {
        throw new SidetreeError(ErrorCode.QueueingMultipleOperationsPerDidNotAllowed);
      }
    } catch (error) {
      // Give meaningful/specific error code and message when possible.
      if (error instanceof SidetreeError) {
        console.info(`Bad request: ${error.code}`);
        console.info(`Error message: ${error.message}`);
        return {
          status: ResponseStatus.BadRequest,
          body: { code: error.code, message: error.message }
        };
      }

      // Else we give a generic bad request response.
      console.info(`Bad request: ${error}`);
      return {
        status: ResponseStatus.BadRequest
      };
    }

    try {
      console.info(`Operation type: '${operation.type}', DID unique suffix: '${operation.didUniqueSuffix}'`);

      // Passed common operation validation, hand off to specific operation handler.
      let response: ResponseModel;
      switch (operation.type) {
        case OperationType.Create:

          const document = await this.applyCreateOperation(operation);

          response = {
            status: ResponseStatus.Succeeded,
            body: document
          };
          break;
        case OperationType.Update:
        case OperationType.Recover:
        case OperationType.Delete:
          response = {
            status: ResponseStatus.Succeeded
          };
          break;
        default:
          response = {
            status: ResponseStatus.ServerError,
            body: { error: 'Not implemented' }
          };
      }

      // if the operation was processed successfully, queue the original request buffer for batching.
      if (response.status === ResponseStatus.Succeeded) {
        await this.operationQueue.enqueue(operation.didUniqueSuffix, operation.operationBuffer);
      }

      return response;
    } catch (error) {
      // Give meaningful/specific error code and message when possible.
      if (error instanceof SidetreeError) {
        console.info(`Unexpected error: ${error.code} ${error.message}`);
        return {
          status: ResponseStatus.ServerError,
          body: { code: error.code, message: error.message }
        };
      }

      console.info(`Unexpected error: ${error}`);
      return {
        status: ResponseStatus.ServerError
      };
    }
  }

  /**
   * Handles resolve operation.
   * @param shortOrLongFormDid Can either be:
   *   1. A short-form DID. e.g. 'did:sidetree:abc' or
   *   2. A long-form DID. e.g. 'did:sidetree:<unique-portion>;initial-values=<encoded-original-did-document>'.
   */
  public async handleResolveRequest (shortOrLongFormDid: string): Promise<ResponseModel> {
    try {
      console.log(`Handling resolution request for: ${shortOrLongFormDid}...`);

      const did = await Did.create(shortOrLongFormDid, this.didMethodName);

      if (did.isShortForm) {
        return this.handleResolveRequestWithShortFormDid(did);
      } else {
        return this.handleResolveRequestWithLongFormDid(did);
      }
    } catch (error) {
      // Give meaningful/specific error code and message when possible.
      if (error instanceof SidetreeError) {
        return {
          status: ResponseStatus.BadRequest,
          body: { code: error.code, message: error.message }
        };
      }

      console.info(`Unexpected error: ${error}`);
      return {
        status: ResponseStatus.ServerError
      };
    }
  }

  private async handleResolveRequestWithShortFormDid (did: Did): Promise<ResponseModel> {
    const didDocument = await this.resolver.resolve(did.uniqueSuffix);

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

  private async handleResolveRequestWithLongFormDid (did: Did): Promise<ResponseModel> {
    // Attempt to resolve the DID by using operations found from the network.
    let didDocument = await this.resolver.resolve(did.uniqueSuffix);

    // If DID Document found then return it.
    if (didDocument) {
      return {
        status: ResponseStatus.Succeeded,
        body: didDocument
      };
    }

    // The code reaches here if this DID is not registered on the ledger.

    const document = await this.applyCreateOperation(did.createOperation!);

    return {
      status: ResponseStatus.Succeeded,
      body: document
    };
  }

  private async applyCreateOperation (createOpertion: OperationModel): Promise<any> {
    const didResolutionModel: DidResolutionModel = {};
    const operationWithMockedAnchorTime = {
      didUniqueSuffix: createOpertion.didUniqueSuffix,
      type: OperationType.Create,
      transactionTime: 0,
      transactionNumber: 0,
      operationIndex: 0,
      operationBuffer: createOpertion.operationBuffer
    }; // NOTE: The transaction timing does not matter here, we are just computing a "theoretical" document if it were anchored on blockchain.

    await this.operationProcessor.apply(operationWithMockedAnchorTime, didResolutionModel);
    return didResolutionModel.didDocument;
  }
}

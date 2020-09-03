import Delta from './Delta';
import Did from './Did';
import DidState from '../../models/DidState';
import DocumentComposer from './DocumentComposer';
import ErrorCode from './ErrorCode';
import IOperationQueue from './interfaces/IOperationQueue';
import IRequestHandler from '../../interfaces/IRequestHandler';
import JsonAsync from './util/JsonAsync';
import Operation from './Operation';
import OperationModel from './models/OperationModel';
import OperationProcessor from './OperationProcessor';
import OperationType from '../../enums/OperationType';
import Resolver from '../../Resolver';
import ResponseModel from '../../../common/models/ResponseModel';
import ResponseStatus from '../../../common/enums/ResponseStatus';
import SidetreeError from '../../../common/SidetreeError';

/**
 * Sidetree operation request handler.
 */
export default class RequestHandler implements IRequestHandler {

  private operationProcessor: OperationProcessor;

  public constructor (
    private resolver: Resolver,
    private operationQueue: IOperationQueue,
    private didMethodName: string) {
    this.operationProcessor = new OperationProcessor();
  }

  /**
   * Handles an operation request.
   */
  public async handleOperationRequest (request: Buffer): Promise<ResponseModel> {
    console.info(`Handling operation request of size ${request.length} bytes...`);

    // Perform common validation for any write request and parse it into an `OperationModel`.
    let operationModel: OperationModel;
    try {
      const operationRequest = await JsonAsync.parse(request);

      // Check `delta` property data size if they exist in the operation.
      if (operationRequest.type === OperationType.Create ||
          operationRequest.type === OperationType.Recover ||
          operationRequest.type === OperationType.Update) {
        Delta.validateEncodedDeltaSize(operationRequest.delta);
      }

      operationModel = await Operation.parse(request);

      // Reject operation if there is already an operation for the same DID waiting to be batched and anchored.
      if (await this.operationQueue.contains(operationModel.didUniqueSuffix)) {
        const errorMessage = `An operation request already exists in queue for DID '${operationModel.didUniqueSuffix}', only one is allowed at a time.`;
        throw new SidetreeError(ErrorCode.QueueingMultipleOperationsPerDidNotAllowed, errorMessage);
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
      console.info(`Operation type: '${operationModel.type}', DID unique suffix: '${operationModel.didUniqueSuffix}'`);

      // Passed common operation validation, hand off to specific operation handler.
      let response: ResponseModel;
      switch (operationModel.type) {
        case OperationType.Create:
          response = await this.handleCreateRequest(operationModel);
          break;
        // these cases do nothing because we do not know the latest document state unless we resolve.
        case OperationType.Update:
        case OperationType.Recover:
        case OperationType.Deactivate:
          response = {
            status: ResponseStatus.Succeeded
          };
          break;
        default:
          // Should be an impossible condition, but we defensively check and handle.
          response = {
            status: ResponseStatus.BadRequest,
            body: { code: ErrorCode.RequestHandlerUnknownOperationType, message: `Unsupported operation type '${operationModel.type}'.` }
          };
      }

      // if the operation was processed successfully, queue the original request buffer for batching.
      if (response.status === ResponseStatus.Succeeded) {
        await this.operationQueue.enqueue(operationModel.didUniqueSuffix, operationModel.operationBuffer);
      }

      return response;
    } catch (error) {
      // Give meaningful/specific error code and message when possible.
      if (error instanceof SidetreeError) {
        console.info(`Sidetree error: ${error.code} ${error.message}`);
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

  private async handleCreateRequest (operationModel: OperationModel): Promise<ResponseModel> {
    const didState = await this.applyCreateOperation(operationModel);

    // Should be an impossible condition, but we defensively check and handle.
    if (didState === undefined) {
      return {
        status: ResponseStatus.BadRequest,
        body: 'Invalid create operation.'
      };
    }

    const did = `did:${this.didMethodName}:${operationModel.didUniqueSuffix}`;
    const published = false;
    const document = DocumentComposer.transformToExternalDocument(didState, did, published);

    return {
      status: ResponseStatus.Succeeded,
      body: document
    };
  }

  /**
   * Handles resolve operation.
   * @param shortOrLongFormDid Can either be:
   *   1. A short-form DID. e.g. 'did:<methodName>:abc' or
   *   2. A long-form DID. e.g. 'did:<methodName>:<unique-portion>?-<methodName>-initial-state=<create-operation-suffix-data>.<create-operation-delta>' or
   *                            'did:<methodName>:<unique-portion>:<create-operation-suffix-data>.<create-operation-delta>'
   */
  public async handleResolveRequest (shortOrLongFormDid: string): Promise<ResponseModel> {
    try {
      console.log(`Handling resolution request for: ${shortOrLongFormDid}...`);

      const did = await Did.create(shortOrLongFormDid, this.didMethodName);

      let didState: DidState | undefined;
      let published = false;
      if (did.isShortForm) {
        didState = await this.resolver.resolve(did.uniqueSuffix);

        if (didState !== undefined) {
          published = true;
        }
      } else {
        [didState, published] = await this.resolveLongFormDid(did);
      }

      if (didState === undefined) {
        return {
          status: ResponseStatus.NotFound,
          body: { code: ErrorCode.DidNotFound, message: 'DID Not Found' }
        };
      }

      // We reach here it means there is a DID Document to return.

      // If DID is published, use the short-form DID; else use long-form DID in document.
      const didStringToUseInDidDocument = published ? did.shortForm : did.longForm!;
      const document = DocumentComposer.transformToExternalDocument(didState, didStringToUseInDidDocument, published);

      return {
        status: ResponseStatus.Succeeded,
        body: document
      };
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

  /**
   * Resolves the given long-form DID by resolving using operations found over the network first;
   * if no operations found, the given create operation will be used to construct the DID state.
   *
   * @returns [DID state, published]
   */
  private async resolveLongFormDid (did: Did): Promise<[DidState | undefined, boolean]> {
    // Attempt to resolve the DID by using operations found from the network first.
    let didState = await this.resolver.resolve(did.uniqueSuffix);

    // If DID state found then return it.
    if (didState !== undefined) {
      return [didState, true];
    }

    // The code reaches here if this DID is not registered on the ledger.

    didState = await this.applyCreateOperation(did.createOperation!);

    return [didState, false];
  }

  private async applyCreateOperation (createOperation: OperationModel): Promise<DidState | undefined> {
    const operationWithMockedAnchorTime = {
      didUniqueSuffix: createOperation.didUniqueSuffix,
      type: OperationType.Create,
      transactionTime: 0,
      transactionNumber: 0,
      operationIndex: 0,
      operationBuffer: createOperation.operationBuffer
    }; // NOTE: The transaction timing does not matter here, we are just computing a "theoretical" document if it were anchored on blockchain.

    const newDidState = await this.operationProcessor.apply(operationWithMockedAnchorTime, undefined);
    return newDidState;
  }
}

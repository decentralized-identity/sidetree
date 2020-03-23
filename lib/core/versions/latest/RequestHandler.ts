import Did from './Did';
import DocumentComposer from './DocumentComposer';
import ErrorCode from './ErrorCode';
import IOperationQueue from './interfaces/IOperationQueue';
import IRequestHandler from '../../interfaces/IRequestHandler';
import Operation from './Operation';
import OperationModel from './models/OperationModel';
import OperationProcessor from './OperationProcessor';
import OperationType from '../../enums/OperationType';
import ProtocolParameters from './ProtocolParameters';
import Resolver from '../../Resolver';
import SidetreeError from '../../../common/SidetreeError';
import { ResponseModel, ResponseStatus } from '../../../common/Response';
import DocumentState from '../../models/DocumentState';
import JsonAsync from './util/JsonAsync';

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

      // Check `operationData` property data size if they exist in the operation.
      if (operationRequest.type === OperationType.Create ||
          operationRequest.type === OperationType.Recover ||
          operationRequest.type === OperationType.Update) {
        const operationDataBuffer = Buffer.from(operationRequest.operationData);
        if (operationDataBuffer.length > ProtocolParameters.maxOperationDataSizeInBytes) {
          const errorMessage = `operationDdata byte size of ${operationDataBuffer.length} exceeded limit of ${ProtocolParameters.maxOperationDataSizeInBytes}`;
          console.info(errorMessage);
          throw new SidetreeError(ErrorCode.RequestHandlerOperationDataExceedsMaximumSize, errorMessage);
        }
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

          const documentState = await this.applyCreateOperation(operationModel);

          if (documentState === undefined) {
            response = {
              status: ResponseStatus.BadRequest,
              body: 'Invalid create operation.'
            };
            break;
          }

          const document = DocumentComposer.transformToExternalDocument(documentState, this.didMethodName);

          response = {
            status: ResponseStatus.Succeeded,
            body: document
          };
          break;
        case OperationType.Update:
        case OperationType.Recover:
        case OperationType.Revoke:
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
        await this.operationQueue.enqueue(operationModel.didUniqueSuffix, operationModel.operationBuffer);
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
   *   2. A long-form DID. e.g. 'did:sidetree:<unique-portion>?-<methodName>-initial-state=<encoded-original-did-document>'.
   */
  public async handleResolveRequest (shortOrLongFormDid: string): Promise<ResponseModel> {
    try {
      console.log(`Handling resolution request for: ${shortOrLongFormDid}...`);

      const did = await Did.create(shortOrLongFormDid, this.didMethodName);

      let documentState: DocumentState | undefined;
      if (did.isShortForm) {
        documentState = await this.resolver.resolve(did.uniqueSuffix);
      } else {
        documentState = await this.resolveLongFormDid(did);
      }

      if (documentState === undefined) {
        return {
          status: ResponseStatus.NotFound
        };
      }

      const document = DocumentComposer.transformToExternalDocument(documentState, this.didMethodName);

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
   * if no operations found, the given create operation will is used to construct the document state.
   */
  private async resolveLongFormDid (did: Did): Promise<DocumentState | undefined> {
    // Attempt to resolve the DID by using operations found from the network first.
    let documentState = await this.resolver.resolve(did.uniqueSuffix);

    // If document state found then return it.
    if (documentState !== undefined) {
      return documentState;
    }

    // The code reaches here if this DID is not registered on the ledger.

    documentState = await this.applyCreateOperation(did.createOperation!);

    return documentState;
  }

  private async applyCreateOperation (createOpertion: OperationModel): Promise<DocumentState | undefined> {
    const operationWithMockedAnchorTime = {
      didUniqueSuffix: createOpertion.didUniqueSuffix,
      type: OperationType.Create,
      transactionTime: 0,
      transactionNumber: 0,
      operationIndex: 0,
      operationBuffer: createOpertion.operationBuffer
    }; // NOTE: The transaction timing does not matter here, we are just computing a "theoretical" document if it were anchored on blockchain.

    const newDocumentState = await this.operationProcessor.apply(operationWithMockedAnchorTime, undefined);
    return newDocumentState;
  }
}

import Encoder from './Encoder';
import Did from './Did';
import Document from './Document';
import ErrorCode from './ErrorCode';
import IOperationQueue from './interfaces/IOperationQueue';
import IRequestHandler from '../../interfaces/IRequestHandler';
import Multihash from './Multihash';
import Operation from './Operation';
import OperationType from '../../enums/OperationType';
import ProtocolParameters from './ProtocolParameters';
import Resolver from '../../Resolver';
import { ResponseModel, ResponseStatus } from '../../../common/Response';
import { SidetreeError } from '../../Error';

/**
 * Sidetree operation request handler.
 */
export default class RequestHandler implements IRequestHandler {

  public constructor (
    private resolver: Resolver,
    private operationQueue: IOperationQueue,
    private didMethodName: string,
    private allSupportedHashAlgorithms: number[]) { }

  /**
   * Handles an operation request.
   */
  public async handleOperationRequest (request: Buffer): Promise<ResponseModel> {
    console.info(`Handling operation request of size ${request.length} bytes...`);

    // Perform common validation for any write request and parse it into an `Operation`.
    let operation: Operation;
    try {
      // Validate operation request size.
      if (request.length > ProtocolParameters.maxOperationByteSize) {
        const errorMessage = `Operation byte size of ${request.length} exceeded limit of ${ProtocolParameters.maxOperationByteSize}`;
        console.info(errorMessage);
        throw new SidetreeError(ErrorCode.OperationExceedsMaximumSize, errorMessage);
      }

      // Parse request into an Operation.
      operation = Operation.create(request);

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
          const didDocument = Document.from(operation.encodedPayload, this.didMethodName, ProtocolParameters.hashAlgorithmInMultihashCode);

          response = {
            status: ResponseStatus.Succeeded,
            body: didDocument
          };
          break;
        case OperationType.Update:
          response = {
            status: ResponseStatus.Succeeded
          };
          break;
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

      // Else we give a generic bad request response.
      console.info(`Unexpected error: ${error}`);
      return {
        status: ResponseStatus.ServerError
      };
    }
  }

  /**
   * Handles resolve operation.
   * @param didOrDidDocument Can either be:
   *   1. Fully qualified DID. e.g. 'did:sidetree:abc' or
   *   2. An encoded DID Document prefixed by the DID method name. e.g. 'did:sidetree:<encoded-DID-Document>'.
   */
  public async handleResolveRequest (didOrDidDocument: string): Promise<ResponseModel> {
    console.log(`Handling resolution request for: ${didOrDidDocument}...`);
    if (!didOrDidDocument.startsWith(this.didMethodName)) {
      return {
        status: ResponseStatus.BadRequest
      };
    }

    // Figure out if the given parameter contains a DID or DID Document.
    let uniquePortion;
    let parameterIsDid;
    try {
      uniquePortion = didOrDidDocument.substring(this.didMethodName.length);

      parameterIsDid = Multihash.isSupportedHash(Encoder.decodeAsBuffer(uniquePortion), this.allSupportedHashAlgorithms);
    } catch {
      return {
        status: ResponseStatus.BadRequest
      };
    }

    if (parameterIsDid) {
      return this.handleResolveRequestWithDid(didOrDidDocument);
    } else {
      return this.handleResolveRequestWithDidDocument(uniquePortion);
    }
  }

  private async handleResolveRequestWithDid (did: string): Promise<ResponseModel> {
    const didUniqueSuffix = did.substring(this.didMethodName.length);
    const didDocument = await this.resolver.resolve(didUniqueSuffix);

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

  private async handleResolveRequestWithDidDocument (encodedDidDocument: string): Promise<ResponseModel> {
    // TODO: Issue #256 - Revisit resolution using Initial DID Document, currently assumes this versions protocol parameters.
    const currentHashAlgorithm = ProtocolParameters.hashAlgorithmInMultihashCode;

    // Validate that the given encoded DID Document is a valid original document.
    const isValidOriginalDocument = Document.isEncodedStringValidOriginalDocument(encodedDidDocument, ProtocolParameters.maxOperationByteSize);
    if (!isValidOriginalDocument) {
      return { status: ResponseStatus.BadRequest };
    }

    // Currently assumes that resolution with full DID document occurs only near initial bootstrapping.
    const didUniqueSuffix = Did.getUniqueSuffixFromEncodeDidDocument(encodedDidDocument, currentHashAlgorithm);

    // Attempt to resolve the DID.
    const didDocument = await this.resolver.resolve(didUniqueSuffix);

    // If DID Document found then return it.
    if (didDocument) {
      return {
        status: ResponseStatus.Succeeded,
        body: didDocument
      };
    }

    // Else contruct a DID Document with valid DID using the given encoded DID Document string.
    const constructedDidDocument = Document.from(encodedDidDocument, this.didMethodName, currentHashAlgorithm);

    return {
      status: ResponseStatus.Succeeded,
      body: constructedDidDocument
    };
  }
}

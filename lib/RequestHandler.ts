import BatchWriter from './BatchWriter';
import Encoder from './Encoder';
import Did from './util/Did';
import Document, { IDocument } from './util/Document';
import Multihash from './Multihash';
import OperationProcessor from './OperationProcessor';
import ProtocolParameters from './ProtocolParameters';
import { Blockchain } from './Blockchain';
import { ErrorCode, SidetreeError } from './Error';
import { Operation, OperationType } from './Operation';
import { IResponse, ResponseStatus } from './Response';

/**
 * Sidetree operation request handler.
 */
export default class RequestHandler {

  public constructor (
    private operationProcessor: OperationProcessor,
    private blockchain: Blockchain,
    private batchWriter: BatchWriter,
    private didMethodName: string) {
  }

  /**
   * Handles an operation request.
   */
  public async handleOperationRequest (request: Buffer): Promise<IResponse> {
    let protocolParameters;
    try {
      // Get the protocol version according to current blockchain time to validate the operation request.
      const currentTime = await this.blockchain.getLatestTime();
      protocolParameters = ProtocolParameters.get(currentTime.time + 1);
    } catch {
      return {
        status: ResponseStatus.ServerError,
        body: new SidetreeError(ErrorCode.DidNotFound)
      };
    }

    // Perform common validation for any write request and parse it into an `Operation`.
    let operation: Operation;
    try {
      // Validate operation request size.
      if (request.length > protocolParameters.maxOperationByteSize) {
        throw new Error(`Operation byte size of ${request.length} exceeded limit of ${protocolParameters.maxOperationByteSize}`);
      }

      // Parse request into a Operation.
      operation = Operation.create(request);

      // TODO: Validate or perform proof-of-work.

    } catch {
      return {
        status: ResponseStatus.BadRequest
      };
    }

    try {
      // Passed common operation validation, hand off to specific operation handler.
      let response: IResponse;
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
        this.batchWriter.add(request);
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
   * @param didOrDidDocument Can either be:
   *   1. Fully qualified DID. e.g. 'did:sidetree:abc' or
   *   2. An encoded DID Document prefixed by the DID method name. e.g. 'did:sidetree:<encoded-DID-Document>'.
   */
  public async handleResolveRequest (didOrDidDocument: string): Promise<IResponse> {
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

      const supportedHashAlgorithms = ProtocolParameters.getSupportedHashAlgorithms();
      parameterIsDid = Multihash.isSupportedHash(Encoder.decodeAsBuffer(uniquePortion), supportedHashAlgorithms);
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

  private async handleResolveRequestWithDid (did: string): Promise<IResponse> {
    const didUniqueSuffix = did.substring(this.didMethodName.length);
    const didDocument = await this.operationProcessor.resolve(didUniqueSuffix);

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

  private async handleResolveRequestWithDidDocument (encodedDidDocument: string): Promise<IResponse> {
    // Get the protocol version according to current blockchain time.
    const currentTime = await this.blockchain.getLatestTime();
    const protocolVersion = ProtocolParameters.get(currentTime.time);
    const currentHashAlgorithm = protocolVersion.hashAlgorithmInMultihashCode;

    // Validate that the given encoded DID Document is a valid original document.
    const isValidOriginalDocument = Document.isEncodedStringValidOriginalDocument(encodedDidDocument, protocolVersion.maxOperationByteSize);
    if (!isValidOriginalDocument) {
      return { status: ResponseStatus.BadRequest };
    }

    const didUniqueSuffix = Did.getUniqueSuffixFromEncodeDidDocument(encodedDidDocument, currentHashAlgorithm);

    // Attempt to resolve the DID.
    const didDocument = await this.operationProcessor.resolve(didUniqueSuffix);

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

  /**
   * Handles create operation.
   */
  public async handleCreateOperation (operation: Operation): Promise<IResponse> {
    // Get the protocol version according to current blockchain time.
    const currentTime = await this.blockchain.getLatestTime();
    const protocolVersion = ProtocolParameters.get(currentTime.time);

    // Validate that the given encoded DID Document is a valid original document.
    const isValidOriginalDocument = Document.isEncodedStringValidOriginalDocument(operation.encodedPayload, protocolVersion.maxOperationByteSize);
    if (!isValidOriginalDocument) {
      return { status: ResponseStatus.BadRequest };
    }

    // Construct real DID document and return it.
    const didDocument = Document.from(operation.encodedPayload, this.didMethodName, protocolVersion.hashAlgorithmInMultihashCode);

    return {
      status: ResponseStatus.Succeeded,
      body: didDocument
    };
  }

  /**
   * Handles update operation.
   */
  public async handleUpdateOperation (operation: Operation): Promise<IResponse> {
    // TODO: Assert that operation is well-formed once the code reaches here.
    // ie. Need to make sure invalid patch etc will cause Operation creation failure.

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
  public async handleDeleteOperation (operation: Operation): Promise<IResponse> {
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
   * This method is used to sanity validate a write-operation request before it is queued for batch-writing.
   * NOTE: This method is intentionally not placed within Operation Processor because:
   * 1. This avoids to create yet another interface method.
   * 2. It is more appropriate to think of this method a higher-layer logic that uses the building blocks exposed by the Operation Processor.
   * @param operation The Update operation to be applied.
   * @returns The resultant DID Document.
   * @throws Error if operation given is invalid.
   */
  private async simulateUpdateOperation (operation: Operation): Promise<IDocument> {
    // TODO: add and refactor code such that same validation code is used by this method and anchored operation processing.

    // Get the current DID Document of the specified DID.
    const currentDidDcoument = await this.operationProcessor.resolve(operation.didUniqueSuffix!);
    if (!currentDidDcoument) {
      throw new SidetreeError(ErrorCode.DidNotFound);
    }

    // Apply the patch on top of the current DID Document.
    const updatedDidDocument = Operation.applyJsonPatchToDidDocument(currentDidDcoument, operation.patch!);
    return updatedDidDocument;
  }

  private async simulateDeleteOperation (operation: Operation) {
    // TODO: add and refactor code such that same validation code is used by this method and anchored operation processing.

    const currentDidDcoument = await this.operationProcessor.resolve(operation.didUniqueSuffix!);

    if (!currentDidDcoument) {
      throw new SidetreeError(ErrorCode.DidNotFound);
    }

    return;
  }
}

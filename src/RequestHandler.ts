import * as Base58 from 'bs58';
import Multihash from './Multihash';
import Rooter from './Rooter';
import { Blockchain } from './Blockchain';
import { getProtocol } from './Protocol';
import { OperationType, WriteOperation } from './Operation';
import { Response, ResponseStatus } from './Response';

/**
 * Sidetree operation request handler.
 */
export default class RequestHandler {

  public constructor (private blockchain: Blockchain, private rooter: Rooter, private didMethodName: string) {
  }

  /**
   * Handles write operations.
   */
  public async handleWriteRequest (request: Buffer): Promise<Response> {
    // Perform common validation for any write request and parse it into a write operation.
    let operation: WriteOperation;
    try {
      // Get the protocol version according to current block number to validate the operation request.
      const latestBlock = await this.blockchain.getLastBlock();
      const protocol = getProtocol(latestBlock.blockNumber + 1);

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
        status: ResponseStatus.BadRequest,
        body: { error: 'Bad request.' }
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
        status: ResponseStatus.ServerError,
        body: { error: 'Server error.' }
      };
    }
  }

  /**
   * Handles resolve operation.
   */
  public handleResolveRequest (_did: string): Response {
    return {
      status: ResponseStatus.ServerError,
      body: { error: 'Not implemented' }
    };
  }

  /**
   * Handles create operation.
   */
  public async handleCreateOperation (operation: WriteOperation): Promise<Response> {
    // Get the protocol version according to current block number to decide on the hashing algorithm used for the DID.
    const latestBlock = await this.blockchain.getLastBlock();
    const protocol = getProtocol(latestBlock.blockNumber + 1);

    // Compute the hash as the DID
    const multihash = Multihash.hash(operation.operationBuffer, protocol.hashAlgorithmInMultihashCode);
    const multihashBase58 = Base58.encode(multihash);
    const did = this.didMethodName + multihashBase58;

    // TODO: Ensure there is not an existing DID.

    // TODO: Validate that there is not already a pending operation for the same DID in the queue.

    // Construct real DID document and return it.
    const didDocument = operation.didDocument!;
    didDocument.id = did;

    return {
      status: ResponseStatus.Succeeded,
      body: didDocument
    };
  }
}

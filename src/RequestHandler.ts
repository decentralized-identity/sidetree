import Protocol from './Protocol';
import { OperationType, WriteOperation } from './Operation';
import { Response, ResponseStatus } from './Response';
import { rooter } from './Rooter';

/**
 * Handles write operations.
 */
function handleWriteRequest (request: Buffer): Response {
  // Perform common validation for any write request and parse it into a write operation.
  let operation: WriteOperation;
  try {
    // Validate request size.
    if (request.length > Protocol.maxOperationsPerBatch) {
      throw new Error(`Operation byte size of ${request.length} exceeded limit of ${Protocol.maxOperationsPerBatch}`);
    }

    // Parse request into a WriteOperation.
    operation = WriteOperation.parse(request);

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
        response = handleCreateOperation(operation);
        break;
      default:
        response = {
          status: ResponseStatus.ServerError,
          body: { error: 'Not implemented' }
        };
    }

    // if the operation was processed successfully, queue the original request buffer for batching.
    if (response.status === ResponseStatus.Succeeded) {
      rooter.add(request);
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
function handleResolveRequest (_did: string): Response {
  return {
    status: ResponseStatus.ServerError,
    body: { error: 'Not implemented' }
  };
}

/**
 * Handles create operation.
 */
function handleCreateOperation (_operation: WriteOperation): Response {
  // TODO: Ensure there is not an existing DID.

  // TODO: Validate that there is not already a pending operation for the same DID in the queue.

  // TODO: Construct real DID document and return it.
  return {
    status: ResponseStatus.ServerError,
    body: { error: 'Not implemented' }
  };
}

export { handleWriteRequest, handleResolveRequest };

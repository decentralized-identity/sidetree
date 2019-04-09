import * as Protocol from './Protocol';
import Document, { IDocument } from './lib/Document';
import { Operation, OperationType } from './Operation';
import { OperationStore } from './OperationStore';

/**
 * Implementation of OperationProcessor. Uses a OperationStore
 * that might, e.g., use a backend database for persistence.
 * All 'processing' is deferred to resolve time, with process()
 * simply storing the operation in the store.
 */
export default class OperationProcessor {

  public constructor (private didMethodName: string, private operationStore: OperationStore) { }

  /**
   * Process a batch of operations. Simply store the operations in the
   * store.
   */
  public async processBatch (operations: Array<Operation>): Promise<void> {
    return this.operationStore.putBatch(operations);
  }

  /**
   * Remove all previously processed operations with transactionNumber
   * greater or equal to the provided transaction number. Relies on
   * OperationStore.delete that implements this functionality.
   */
  public async rollback (transactionNumber?: number): Promise<void> {
    return this.operationStore.delete(transactionNumber);
  }

  /**
   * Resolve the given DID unique suffix to its DID Doducment.
   * @param didUniqueSuffix The unique suffix of the DID to resolve. e.g. if 'did:sidetree:abc123' is the DID, the unique suffix would be 'abc123'
   * @returns DID Document. Undefined if the unique suffix of the DID is deleted or not found.
   *
   * Iterate over all operations in blockchain-time order extending the
   * the operation chain while checking validity.
   */
  public async resolve (didUniqueSuffix: string): Promise<IDocument | undefined> {
    let didDocument: IDocument | undefined;
    let previousOperation: Operation | undefined;

    const didOps = await this.operationStore.get(didUniqueSuffix);

    // Apply each operation in chronological order to build a complete DID Document.
    for (const operation of didOps) {
      let isOperationValid: boolean;
      [isOperationValid, didDocument] = await this.apply(operation, previousOperation, didDocument);

      if (isOperationValid) {
        previousOperation = operation;

        // If this is a delete operation, this will be the last valid operation for this DID.
        if (operation.type === OperationType.Delete) {
          break;
        }
      }
    }

    return didDocument;
  }

  /**
   * Applies an operation against a DID document.
   * @param operation The operation to apply against the given current DID Document (if any).
   * @param previousOperation The previously operation applied if any. Used for operation validation.
   * @param currentDidDocument The DID document to apply the given operation against.
   * @returns [isOperationValid, updatedDidDocument]; isOperationValid is a boolean that indicates if the
   *          operation is valid given the operation context. If the operation is valid, updatedDidDocument
   *          contains the updated document, Otherwise, it contains currentDidDocument (unchanged).
   */
  private async apply (operation: Operation, previousOperation: Operation | undefined, currentDidDocument: IDocument | undefined):
    Promise<[boolean, IDocument | undefined]> {

    if (operation.type === OperationType.Create) {

      // If either of these is defined, then we have seen a previous create operation.
      if (previousOperation || currentDidDocument) {
        return [false, currentDidDocument];
      }

      const originalDidDocument = this.getOriginalDocument(operation);
      if (originalDidDocument === undefined) {
        return [false, currentDidDocument];
      }

      const signingKey = Document.getPublicKey(originalDidDocument, operation.signingKeyId);

      if (!signingKey) {
        return [false, currentDidDocument];
      }

      if (!(await operation.verifySignature(signingKey))) {
        return [false, currentDidDocument];
      }

      return [true, originalDidDocument];
    } else if (operation.type === OperationType.Delete) {
      // Delete can be applied only on valid did with a current document
      if (!currentDidDocument) {
        return [false, undefined];
      }

      // The current did document should contain the public key mentioned in the operation ...
      const publicKey = Document.getPublicKey(currentDidDocument, operation.signingKeyId);
      if (!publicKey) {
        return [false, currentDidDocument];
      }

      // ... and the signature should verify
      if (!(await operation.verifySignature(publicKey))) {
        return [false, currentDidDocument];
      }

      // If the delete is valid,
      return [true, undefined];
    } else {
      // Every operation other than a create has a previous operation and a valid
      // current DID document.
      if (!previousOperation || !currentDidDocument) {
        return [false, currentDidDocument];
      }

      // Any non-create needs a previous operation hash  ...
      if (!operation.previousOperationHash) {
        return [false, currentDidDocument];
      }

      // ... that should match the hash of the latest valid operation (previousOperation)
      if (operation.previousOperationHash !== previousOperation.getOperationHash()) {
        return [false, currentDidDocument];
      }

      // The current did document should contain the public key mentioned in the operation ...
      const publicKey = Document.getPublicKey(currentDidDocument, operation.signingKeyId);
      if (!publicKey) {
        return [false, currentDidDocument];
      }

      // ... and the signature should verify
      if (!(await operation.verifySignature(publicKey))) {
        return [false, currentDidDocument];
      }

      const patchedDocument = Operation.applyJsonPatchToDidDocument(currentDidDocument, operation.patch!);
      return [true, patchedDocument];
    }
  }

  /**
   * Gets the original DID document from a create operation.
   */
  private getOriginalDocument (createOperation: Operation): IDocument | undefined {
    const protocolVersion = Protocol.getProtocol(createOperation.transactionTime!);
    return Document.from(createOperation.encodedPayload, this.didMethodName, protocolVersion.hashAlgorithmInMultihashCode);
  }
}

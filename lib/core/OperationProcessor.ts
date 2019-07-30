import Document, { IDocument } from './Document';
import OperationStore from './interfaces/OperationStore';
import ProtocolParameters from './ProtocolParameters';
import { Operation, OperationType } from './Operation';

/**
 * Implementation of OperationProcessor. Uses a OperationStore
 * that might, e.g., use a backend database for persistence.
 * All 'processing' is deferred to resolve time, with process()
 * simply storing the operation in the store.
 */
export default class OperationProcessor {

  public constructor (private didMethodName: string, private operationStore: OperationStore) { }

  // /**
  //  * Process a batch of operations. Simply store the operations in the
  //  * store.
  //  */
  // public async process (operations: Array<Operation>): Promise<void> {
  //   return this.operationStore.put(operations);
  // }

  /**
   * NOTE: this maybe the only method left after refactoring, thus class renaming is likely.
   * Remove all previously processed operations with transactionNumber
   * greater than the provided transaction number. Relies on
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
    console.info(`Resolving DID unique suffix '${didUniqueSuffix}'...`);

    // NOTE: We create an object referencing the DID document to be constructed so that both:
    // 1. `didDocument` can be `undefined` initially; and
    // 2. `didDocument` can be modified directly in-place in subsequent document patching.
    let didDocumentReference: { didDocument: IDocument | undefined } = { didDocument: undefined };
    let previousOperation: Operation | undefined;

    const didOps = await this.operationStore.get(didUniqueSuffix);

    // Apply each operation in chronological order to build a complete DID Document.
    for (const operation of didOps) {
      let isOperationValid: boolean;
      isOperationValid = await this.apply(operation, previousOperation, didDocumentReference);

      if (isOperationValid) {
        previousOperation = operation;

        // If this is a delete operation, this will be the last valid operation for this DID.
        if (operation.type === OperationType.Delete) {
          break;
        }
      } else {
        const batchFileHash = operation.batchFileHash;
        const operationIndex = operation.operationIndex;
        console.info(`Ignored invalid operation for unique suffix '${didUniqueSuffix}' in batch file '${batchFileHash}' operation index ${operationIndex}.`);
      }
    }

    return didDocumentReference.didDocument;
  }

  /**
   * Applies an operation on top of the given DID document in place.
   * In the case of an invalid operation, the given DID document will be unchanged.
   * In the case of a (valid) delete operation, the given DID document will be set to `undefined`.
   *
   * NOTE: An object referencing the DID document is used so that
   * `didDocumentReference.didDocument` can be `undefined` initially and be set to an object created.
   * An alternative approach is to include the DID Document as a return value, but that would give the
   * misconception that the given DID Document is unchanged.
   *
   * @param operation The operation to apply against the given DID Document (if any).
   * @param previousOperation The previously operation applied if any. Used for operation validation.
   * @param didDocumentReference The object containing DID document to apply the given operation against.
   * @returns a boolean that indicates if the operation is valid and applied.
   */
  private async apply (operation: Operation, previousOperation: Operation | undefined, didDocumentReference: { didDocument: IDocument | undefined }):
    Promise<boolean> {
    // NOTE: only used for read interally.
    const didDocument = didDocumentReference.didDocument;

    if (operation.type === OperationType.Create) {

      // If either of these is defined, then we have seen a previous create operation.
      if (previousOperation || didDocumentReference.didDocument) {
        return false;
      }

      const originalDidDocument = this.getOriginalDocument(operation)!;

      const signingKey = Document.getPublicKey(originalDidDocument, operation.signingKeyId);

      if (!signingKey) {
        return false;
      }

      if (!(await operation.verifySignature(signingKey))) {
        return false;
      }

      didDocumentReference.didDocument = originalDidDocument;
      return true;
    } else if (operation.type === OperationType.Delete) {
      // Delete can be applied only on valid did with a current document
      if (!didDocument) {
        return false;
      }

      // The current did document should contain the public key mentioned in the operation ...
      const publicKey = Document.getPublicKey(didDocument, operation.signingKeyId);
      if (!publicKey) {
        return false;
      }

      // ... and the signature should verify
      if (!(await operation.verifySignature(publicKey))) {
        return false;
      }

      // If the delete is valid
      didDocumentReference.didDocument = undefined;
      return true;
    } else {
      // Update operation

      // Every operation other than a create has a previous operation and a valid
      // current DID document.
      if (!previousOperation || !didDocument) {
        return false;
      }

      // Any non-create needs a previous operation hash that should match the hash of the latest valid operation (previousOperation)
      if (operation.previousOperationHash !== previousOperation.getOperationHash()) {
        return false;
      }

      // The current did document should contain the public key mentioned in the operation ...
      const publicKey = Document.getPublicKey(didDocument, operation.signingKeyId);
      if (!publicKey) {
        return false;
      }

      // ... and the signature should verify
      if (!(await operation.verifySignature(publicKey))) {
        return false;
      }

      Operation.applyPatchesToDidDocument(didDocument, operation.patches!);
      return true;
    }
  }

  /**
   * Gets the original DID document from a create operation.
   */
  private getOriginalDocument (createOperation: Operation): IDocument | undefined {
    const protocolVersion = ProtocolParameters.get(createOperation.transactionTime!);
    return Document.from(createOperation.encodedPayload, this.didMethodName, protocolVersion.hashAlgorithmInMultihashCode);
  }
}

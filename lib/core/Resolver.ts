import IOperationProcessor from './interfaces/IOperationProcessor';
import OperationStore from './interfaces/OperationStore';
import { IDocument } from './Document';
import { Operation, OperationType } from './Operation';

/**
 * Implementation of OperationProcessor. Uses a OperationStore
 * that might, e.g., use a backend database for persistence.
 * All 'processing' is deferred to resolve time, with process()
 * simply storing the operation in the store.
 */
export default class Resolver {

  public constructor (private getOperationProcessor: (blockchainTime: number) => IOperationProcessor, private operationStore: OperationStore) { }

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
      const operationProcessor = this.getOperationProcessor(operation.transactionTime!);

      let isOperationValid: boolean;
      isOperationValid = await operationProcessor.apply(operation, previousOperation, didDocumentReference);
      // isOperationValid = await this.apply(operation, previousOperation, didDocumentReference);

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
}

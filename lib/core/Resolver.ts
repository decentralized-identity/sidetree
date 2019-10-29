import AnchoredOperationModel from './models/AnchoredOperationModel';
import IOperationStore from './interfaces/IOperationStore';
import IVersionManager from './interfaces/IVersionManager';
import OperationType from './enums/OperationType';

/**
 * Implementation of OperationProcessor. Uses a OperationStore
 * that might, e.g., use a backend database for persistence.
 * All 'processing' is deferred to resolve time, with process()
 * simply storing the operation in the store.
 *
 * NOTE: Resolver needs to be versioned because it depends on `VersionManager` being constructed to fetch the versioned operation processor.
 */
export default class Resolver {

  public constructor (private versionManager: IVersionManager, private operationStore: IOperationStore) { }

  /**
   * Resolve the given DID unique suffix to its DID Doducment.
   * @param didUniqueSuffix The unique suffix of the DID to resolve. e.g. if 'did:sidetree:abc123' is the DID, the unique suffix would be 'abc123'
   * @returns DID Document. Undefined if the unique suffix of the DID is deleted or not found.
   *
   * Iterate over all operations in blockchain-time order extending the
   * the operation chain while checking validity.
   */
  public async resolve (didUniqueSuffix: string): Promise<object | undefined> {
    console.info(`Resolving DID unique suffix '${didUniqueSuffix}'...`);

    // NOTE: We create an object referencing the DID document to be constructed so that both:
    // 1. `didDocument` can be `undefined` initially; and
    // 2. `didDocument` can be modified directly in-place in subsequent document patching.
    let didDocumentReference: { didDocument: object | undefined } = { didDocument: undefined };
    let previousOperationHash: string | undefined;


    // Get create and recovery operations and process them first.
    // const createAndRecoverOperations = await this.operationStore.get(didUniqueSuffix, [OperationType.Create, OperationType.Recover]);

    const operations = await this.operationStore.get(didUniqueSuffix);
    const createAndRecoverOperations = operations.filter(op => op.type === OperationType.Create || op.type === OperationType.Recover);

    let lastFullOperation: AnchoredOperationModel | undefined;
    // Validate each operation in chronological order to build a complete base DID Document for update patches to be applied on later.
    for (const operation of createAndRecoverOperations) {
      const operationProcessor = this.versionManager.getOperationProcessor(operation.transactionTime);
      const patchResult = await operationProcessor.patch(operation, previousOperationHash, didDocumentReference);

      if (patchResult.validOperation) {
        lastFullOperation = operation;
        previousOperationHash = patchResult.operationHash;
      } else {
        const index = operation.operationIndex;
        const time = operation.transactionTime;
        const number = operation.transactionNumber;
        console.info(`Ignored invalid full operation for DID '${didUniqueSuffix}' in transaction '${number}' at time '${time}' at operation index ${index}.`);
      }
    }

    // If no create operation found at all, the DID is not anchored.
    if (lastFullOperation === undefined) {
      return undefined;
    }

    // Get only update operations that came after the create or last recovery operation.
    const updateOperations = operations.filter(op => op.type === OperationType.Update);
    const updateOperationsToBeApplied = updateOperations.filter(
      op => op.transactionNumber > lastFullOperation!.transactionNumber ||
            (op.transactionNumber === lastFullOperation!.transactionNumber && op.operationIndex > lastFullOperation!.operationIndex)
    );

    // Patch each operation in chronological order to build a complete DID Document.
    for (const operation of updateOperationsToBeApplied) {
      const operationProcessor = this.versionManager.getOperationProcessor(operation.transactionTime);
      const patchResult = await operationProcessor.patch(operation, previousOperationHash, didDocumentReference);

      if (patchResult.validOperation) {
        previousOperationHash = patchResult.operationHash;
      } else {
        const index = operation.operationIndex;
        const time = operation.transactionTime;
        const number = operation.transactionNumber;
        console.info(`Ignored invalid operation for DID '${didUniqueSuffix}' in transaction '${number}' at time '${time}' at operation index ${index}.`);
      }
    }

    // Opportunistic/optional DB pruning: Delete all updates that are prior to the last full (create, recover) operation if any.
    if (updateOperationsToBeApplied.length < updateOperations.length) {
      void this.operationStore.deleteUpdatesEarlierThan(didUniqueSuffix, lastFullOperation.transactionNumber, lastFullOperation.operationIndex);
    }

    return didDocumentReference.didDocument;
  }
}

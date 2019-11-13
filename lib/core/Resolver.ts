import IOperationStore from './interfaces/IOperationStore';
import IVersionManager from './interfaces/IVersionManager';
import NamedAnchoredOperationModel from './models/NamedAnchoredOperationModel';
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

    const operations = await this.operationStore.get(didUniqueSuffix);
    const createAndRecoverAndRevokeOperations = operations.filter(
      op => op.type === OperationType.Create ||
      op.type === OperationType.Recover ||
      op.type === OperationType.Delete);

    // Apply "full" operations first.
    const [lastFullOperation, lastFullOperationHash] =
      await this.applyOperations(didDocumentReference, createAndRecoverAndRevokeOperations, undefined, undefined);

    // If no full operation found at all, the DID is not anchored.
    if (lastFullOperation === undefined) {
      return undefined;
    }

    // Get only update operations that came after the create or last recovery operation.
    const updateOperations = operations.filter(op => op.type === OperationType.Update);
    const updateOperationsToBeApplied = updateOperations.filter(
      op => op.transactionNumber > lastFullOperation!.transactionNumber ||
           (op.transactionNumber === lastFullOperation!.transactionNumber && op.operationIndex > lastFullOperation!.operationIndex)
    );

    // Apply "update/delta" operations.
    await this.applyOperations(didDocumentReference, updateOperationsToBeApplied, lastFullOperation, lastFullOperationHash);

    return didDocumentReference.didDocument;
  }

  /**
   * Applies the given operations to the given DID document.
   * @param didDocumentReference The reference to the DID document to be modified.
   * @param operations The list of operations to be applied in sequence.
   * @param lastOperation  The last operation that was successfully applied.
   * @param lastOperationHash The hash of the last operation that was successfully applied.
   * @returns [last operation that was successfully applied, the hash of the last operation that was successfully applied]
   */
  private async applyOperations (
    didDocumentReference: { didDocument: any | undefined },
    operations: NamedAnchoredOperationModel[],
    lastOperation: NamedAnchoredOperationModel | undefined,
    lastOperationHash: string | undefined
  ): Promise<[NamedAnchoredOperationModel | undefined, string | undefined]> {
    for (const operation of operations) {
      const operationProcessor = this.versionManager.getOperationProcessor(operation.transactionTime);
      const patchResult = await operationProcessor.patch(operation, lastOperationHash, didDocumentReference);

      if (patchResult.validOperation) {
        lastOperation = operation;
        lastOperationHash = patchResult.operationHash;
      } else {
        const index = operation.operationIndex;
        const time = operation.transactionTime;
        const number = operation.transactionNumber;
        const did = didDocumentReference.didDocument ? didDocumentReference.didDocument.id : undefined;
        console.info(`Ignored invalid operation for DID '${did}' in transaction '${number}' at time '${time}' at operation index ${index}.`);
      }
    }

    return [lastOperation, lastOperationHash];
  }
}

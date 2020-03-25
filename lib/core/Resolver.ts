import AnchoredOperationModel from './models/AnchoredOperationModel';
import DocumentState from './models/DocumentState';
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
   * Resolve the given DID unique suffix to its final document state.
   * @param didUniqueSuffix The unique suffix of the DID to resolve. e.g. if 'did:sidetree:abc123' is the DID, the unique suffix would be 'abc123'
   * @returns Final document state of the DID. Undefined if the unique suffix of the DID is not found.
   */
  public async resolve (didUniqueSuffix: string): Promise<DocumentState | undefined> {
    console.info(`Resolving DID unique suffix '${didUniqueSuffix}'...`);

    // NOTE: We are passing an empty document state by reference into apply method so that:
    // 1. `didDocument` can be `undefined` initially; and
    // 2. `didDocument` can be modified directly in-place in subsequent applying of operations.
    let documentState: DocumentState | undefined;

    const operations = await this.operationStore.get(didUniqueSuffix);
    const createAndRecoverAndRevokeOperations = operations.filter(
      op => op.type === OperationType.Create ||
      op.type === OperationType.Recover ||
      op.type === OperationType.Revoke);

    // Apply "full" operations first.
    documentState = await this.applyOperations(createAndRecoverAndRevokeOperations, documentState);

    // If no valid full operation is found at all, the DID is not anchored.
    if (documentState === undefined) {
      return undefined;
    }

    // If last operation is a revoke. No need to continue further.
    if (documentState.nextRecoveryCommitmentHash === undefined) {
      return documentState;
    }

    // Get only update operations that came after the last full operation.
    const lastOperationTransactionNumber = documentState.lastOperationTransactionNumber;
    const updateOperations = operations.filter(op => op.type === OperationType.Update);
    const updateOperationsToBeApplied = updateOperations.filter(op => op.transactionNumber > lastOperationTransactionNumber);

    // Apply "update/delta" operations.
    documentState = await this.applyOperations(updateOperationsToBeApplied, documentState);

    return documentState;
  }

  /**
   * Applies the given operations to the given DID document.
   * @param operations The list of operations to be applied in sequence.
   * @param documentState The document state to apply the operations on top of.
   */
  private async applyOperations (
    operations: AnchoredOperationModel[],
    documentState: DocumentState | undefined
    ): Promise<DocumentState | undefined> {
    let appliedDocumentState = documentState;
    for (const operation of operations) {
      // NOTE: MUST NOT throw error, else a bad operation can be used to denial resolution for any DID.
      try {
        const operationProcessor = this.versionManager.getOperationProcessor(operation.transactionTime);
        appliedDocumentState = await operationProcessor.apply(operation, appliedDocumentState);
      } catch (error) {
        console.log(`Skipped bad operation for DID ${operation.didUniqueSuffix} at time ${operation.transactionTime}. Error: ${error}`);
      }
    }

    return appliedDocumentState;
  }
}

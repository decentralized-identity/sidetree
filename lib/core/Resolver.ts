import AnchoredOperationModel from './models/AnchoredOperationModel';
import DidState from './models/DidState';
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
   * Resolve the given DID unique suffix to its latest DID state.
   * @param didUniqueSuffix The unique suffix of the DID to resolve. e.g. if 'did:sidetree:abc123' is the DID, the unique suffix would be 'abc123'
   * @returns Final DID state of the DID. Undefined if the unique suffix of the DID is not found.
   */
  public async resolve (didUniqueSuffix: string): Promise<DidState | undefined> {
    console.info(`Resolving DID unique suffix '${didUniqueSuffix}'...`);

    const operations = await this.operationStore.get(didUniqueSuffix);
    const createAndRecoverAndDeactivateOperations = operations.filter(
      op => op.type === OperationType.Create ||
      op.type === OperationType.Recover ||
      op.type === OperationType.Deactivate);

    // Apply "full" operations first.
    let didState: DidState | undefined;
    didState = await this.applyOperations(createAndRecoverAndDeactivateOperations, didState);

    // If no valid full operation is found at all, the DID is not anchored.
    if (didState === undefined) {
      return undefined;
    }

    // If last operation is a deactivate. No need to continue further.
    if (didState.nextRecoveryCommitmentHash === undefined) {
      return didState;
    }

    // Get only update operations that came after the last full operation.
    const lastOperationTransactionNumber = didState.lastOperationTransactionNumber;
    const updateOperations = operations.filter(op => op.type === OperationType.Update);
    const updateOperationsToBeApplied = updateOperations.filter(op => op.transactionNumber > lastOperationTransactionNumber);

    // Apply "update/delta" operations.
    didState = await this.applyOperations(updateOperationsToBeApplied, didState);

    return didState;
  }

  /**
   * Applies the given operations to the given DID document.
   * @param operations The list of operations to be applied in sequence.
   * @param didState The DID state to apply the operations on top of.
   */
  private async applyOperations (
    operations: AnchoredOperationModel[],
    didState: DidState | undefined
    ): Promise<DidState | undefined> {
    let appliedDidState = didState;
    for (const operation of operations) {
      // NOTE: MUST NOT throw error, else a bad operation can be used to denial resolution for any DID.
      try {
        const operationProcessor = this.versionManager.getOperationProcessor(operation.transactionTime);
        appliedDidState = await operationProcessor.apply(operation, appliedDidState);
      } catch (error) {
        console.log(`Skipped bad operation for DID ${operation.didUniqueSuffix} at time ${operation.transactionTime}. Error: ${error}`);
      }
    }

    return appliedDidState;
  }
}

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
   * @returns Final DID state of the DID. Undefined if the unique suffix of the DID is not found or state is not constructable.
   */
  public async resolve (didUniqueSuffix: string): Promise<DidState | undefined> {
    console.info(`Resolving DID unique suffix '${didUniqueSuffix}'...`);

    const operations = await this.operationStore.get(didUniqueSuffix);

    // Construct a hash(reveal_value) -> operation map for operations that are NOT creates.
    const createOperations = [];
    const hashToOperationsMap = new Map<string, AnchoredOperationModel[]>();
    for (const operation of operations) {
      if (operation.type === OperationType.Create) {
        createOperations.push(operation);
        continue;
      }

      // Else this operation is NOT a create.
      const operationProcessor = this.versionManager.getOperationProcessor(operation.transactionTime);
      const revealValue = operationProcessor.getRevealValue(operation);
      const hashOfRevealValue = computeHashOfRevealValue(revealValue);

      if (hashToOperationsMap.has(hashOfRevealValue)) {
        hashToOperationsMap.get(hashOfRevealValue)!.push(operation);
      } else {
        hashToOperationsMap.set(hashOfRevealValue, [operation]);
      }
    }

    // Iterate through all duplicates of creates until we can construct a DID state (some creates maybe incomplete. eg. without `delta`).
    let didState: DidState | undefined;
    for (const createOperation of createOperations) {
      didState = await this.applyOperation(createOperation, didState);

      // Exit loop as soon as we can construct an initial state.
      if (didState !== undefined) {
        break;
      }
    }

    // If can't construct an initial DID state.
    if (didState === undefined) {
      return undefined;
    }

    // Apply the next recovery/deactivate until opertaion matching the next recovery commitment cannot be found.
    while (hashToOperationsMap.has(didState.nextRecoveryCommitmentHash!)) {
      let operationsWithCorrectRevealValue: AnchoredOperationModel[] = hashToOperationsMap.get(didState.nextRecoveryCommitmentHash!)!;

      // Take only recoveries and deactivates.
      operationsWithCorrectRevealValue = operationsWithCorrectRevealValue.filter((operation) => operation.type === OperationType.Recover || 
                                                                                                operation.type === OperationType.Deactivate);
      // Sort using blockchain time.
      operationsWithCorrectRevealValue = operationsWithCorrectRevealValue.sort((a, b) => a.transactionNumber - b.transactionNumber);

      const newDidState: DidState | undefined = await this.applyFirstValidOperation(operationsWithCorrectRevealValue, didState!);

      // We are done if we can't find a valid recover/deactivate operation to apply.
      if (newDidState === undefined) {
        break;
      }

      // We reach here if we have successfully computed a new DID state.
      didState = newDidState!;

      // If applied operation is a deactivate. No need to continue further.
      if (didState.nextRecoveryCommitmentHash === undefined) {
        return didState;
      }
    }

    // Apply the next recovery/deactivate until opertaion matching the next recovery commitment cannot be found.
    while (hashToOperationsMap.has(didState.nextUpdateCommitmentHash!)) {
      let operationsWithCorrectRevealValue: AnchoredOperationModel[] = hashToOperationsMap.get(didState.nextUpdateCommitmentHash!)!;

      // Take only updates.
      operationsWithCorrectRevealValue = operationsWithCorrectRevealValue.filter((operation) => operation.type === OperationType.Update);

      // Sort using blockchain time.
      operationsWithCorrectRevealValue = operationsWithCorrectRevealValue.sort((a, b) => a.transactionNumber - b.transactionNumber);

      const newDidState: DidState | undefined = await this.applyFirstValidOperation(operationsWithCorrectRevealValue, didState!);

      // We are done if we can't find a valid update operation to apply.
      if (newDidState === undefined) {
        break;
      }

      // We reach here if we have successfully computed a new DID state.
      didState = newDidState!;

      // If applied operation is a deactivate. No need to continue further.
      if (didState.nextRecoveryCommitmentHash === undefined) {
        return didState;
      }
    }

    return didState;
  }

  /**
   * Applies the given operation to the given DID state.
   * @param operation The operation to be applied.
   * @param didState The DID state to apply the operation on top of.
   */
  private async applyOperation (
    operation: AnchoredOperationModel,
    didState: DidState | undefined
    ): Promise<DidState | undefined> {
    let appliedDidState = didState;

    // NOTE: MUST NOT throw error, else a bad operation can be used to denial resolution for a DID.
    try {
      const operationProcessor = this.versionManager.getOperationProcessor(operation.transactionTime);
      appliedDidState = await operationProcessor.apply(operation, appliedDidState);
    } catch (error) {
      console.log(`Skipped bad operation for DID ${operation.didUniqueSuffix} at time ${operation.transactionTime}. Error: ${error}`);
    }

    return appliedDidState;
  }

  /**
   * @returns The new DID State if a valid operation is applied, `undefined` otherwise.
   */
  private async applyFirstValidOperation (operations: AnchoredOperationModel[], originalDidState: DidState): Promise<DidState | undefined> {
    let newDidState = originalDidState;

    // Stop as soon as an operation is applied successfully.
    for (const operation of operations) {
      newDidState = (await this.applyOperation(operation, newDidState))!;

      // If operation matching the recovery commitment is applied.
      if (newDidState!.lastOperationTransactionNumber !== originalDidState.lastOperationTransactionNumber) {
        return newDidState;
      }
    }

    // Else we reach the end of operations without being able to apply any of them.
    return undefined;
  }
  
  private computeHashOfRevealValue (encodedRevealValue: string): string {
    // Currently assumes SHA256.
    // TODO: Issue #999 Introduce multihash leading bytes to the secret reveal value, so that it gives hint as to what hash algorithm must be used.

  }
}

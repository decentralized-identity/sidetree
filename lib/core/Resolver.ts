import AnchoredOperationModel from './models/AnchoredOperationModel';
import DidState from './models/DidState';
import IOperationStore from './interfaces/IOperationStore';
import IVersionManager from './interfaces/IVersionManager';
import Logger from '../common/Logger';
import Multihash from './versions/latest/Multihash';
import OperationType from './enums/OperationType';
import SidetreeError from '../common/SidetreeError';

/**
 * NOTE: Resolver cannot be versioned because it needs to be aware of `VersionManager` to fetch versioned operation processors.
 */
export default class Resolver {

  public constructor (private versionManager: IVersionManager, private operationStore: IOperationStore) { }

  /**
   * Resolve the given DID unique suffix to its latest DID state.
   * @param didUniqueSuffix The unique suffix of the DID to resolve. e.g. if 'did:sidetree:abc123' is the DID, the unique suffix would be 'abc123'
   * @returns Final DID state of the DID. Undefined if the unique suffix of the DID is not found or the DID state is not constructable.
   */
  public async resolve (didUniqueSuffix: string): Promise<DidState | undefined> {
    Logger.info(`Resolving DID unique suffix '${didUniqueSuffix}'...`);

    const operations = await this.operationStore.get(didUniqueSuffix);
    const operationsByType = Resolver.categorizeOperationsByType(operations);

    // Find and apply a valid create operation.
    let didState = await this.applyCreateOperation(operationsByType.createOperations);

    // If can't construct an initial DID state.
    if (didState === undefined) {
      return undefined;
    }

    // Apply recovery/deactivate operations until an operation matching the next recovery commitment cannot be found.
    const recoverAndDeactivateOperations = operationsByType.recoverOperations.concat(operationsByType.deactivateOperations);
    const recoveryCommitValueToOperationMap = await this.constructCommitValueToOperationLookupMap(recoverAndDeactivateOperations);
    didState = await this.applyRecoverAndDeactivateOperations(didState, recoveryCommitValueToOperationMap);

    // If the previous applied operation is a deactivate. No need to continue further.
    if (didState.nextRecoveryCommitmentHash === undefined) {
      return didState;
    }

    // Apply update operations until an operation matching the next update commitment cannot be found.
    const updateCommitValueToOperationMap = await this.constructCommitValueToOperationLookupMap(operationsByType.updateOperations);
    didState = await this.applyUpdateOperations(didState, updateCommitValueToOperationMap);

    return didState;
  }

  private static categorizeOperationsByType (operations: AnchoredOperationModel[]): {
    createOperations: AnchoredOperationModel[],
    recoverOperations: AnchoredOperationModel[],
    updateOperations: AnchoredOperationModel[],
    deactivateOperations: AnchoredOperationModel[]
  } {
    const createOperations = [];
    const recoverOperations = [];
    const updateOperations = [];
    const deactivateOperations = [];

    for (const operation of operations) {
      if (operation.type === OperationType.Create) {
        createOperations.push(operation);
      } else if (operation.type === OperationType.Recover) {
        recoverOperations.push(operation);
      } else if (operation.type === OperationType.Update) {
        updateOperations.push(operation);
      } else {
        // This is a deactivate operation.
        deactivateOperations.push(operation);
      }
    }
    return {
      createOperations,
      recoverOperations,
      updateOperations,
      deactivateOperations
    };
  }

  /**
   * Iterate through all duplicates of creates until we can construct an initial DID state (some creates maybe incomplete. eg. without `delta`).
   */
  private async applyCreateOperation (createOperations: AnchoredOperationModel[]): Promise<DidState | undefined> {
    let didState;

    for (const createOperation of createOperations) {
      didState = await this.applyOperation(createOperation, undefined);

      // Exit loop as soon as we can construct an initial state.
      if (didState !== undefined) {
        break;
      }
    }

    return didState;
  }

  /**
   * Apply recovery/deactivate operations until an operation matching the next recovery commitment cannot be found.
   */
  private async applyRecoverAndDeactivateOperations (startingDidState: DidState, commitValueToOperationMap: Map<string, AnchoredOperationModel[]>)
    : Promise<DidState> {
    // This stores all commitment hashes of the corresponding reveal values of the operations that have been successfully applied,
    // such that no infinite loop of logical operation chain can be created.
    const commitValuesUsed = new Set<string>();

    let didState = startingDidState;
    while (commitValueToOperationMap.has(didState.nextRecoveryCommitmentHash!)) {
      let operationsWithCorrectRevealValue: AnchoredOperationModel[] = commitValueToOperationMap.get(didState.nextRecoveryCommitmentHash!)!;

      // Sort using blockchain time.
      operationsWithCorrectRevealValue = operationsWithCorrectRevealValue.sort((a, b) => a.transactionNumber - b.transactionNumber);

      const newDidState: DidState | undefined = await this.applyFirstValidOperation(operationsWithCorrectRevealValue, didState, commitValuesUsed);

      // We are done if we can't find a valid recover/deactivate operation to apply.
      if (newDidState === undefined) {
        break;
      }

      // We reach here if we have successfully computed a new DID state.

      // If the previous applied operation is a deactivate. No need to continue further.
      if (newDidState.nextRecoveryCommitmentHash === undefined) {
        return newDidState;
      }

      // Record the commit value so that it is not used again.
      commitValuesUsed.add(didState.nextRecoveryCommitmentHash!);
      didState = newDidState;
    }

    return didState;
  }

  /**
   * Apply update operations until an operation matching the next update commitment cannot be found.
   */
  private async applyUpdateOperations (startingDidState: DidState, commitValueToOperationMap: Map<string, AnchoredOperationModel[]>)
    : Promise<DidState> {
    // This stores all commitment hashes of the corresponding reveal values of the operations that have been successfully applied,
    // such that no infinite loop of logical operation chain can be created.
    const commitValuesUsed = new Set<string>();

    let didState = startingDidState;
    while (commitValueToOperationMap.has(didState.nextUpdateCommitmentHash!)) {
      let operationsWithCorrectRevealValue: AnchoredOperationModel[] = commitValueToOperationMap.get(didState.nextUpdateCommitmentHash!)!;

      // Sort using blockchain time.
      operationsWithCorrectRevealValue = operationsWithCorrectRevealValue.sort((a, b) => a.transactionNumber - b.transactionNumber);

      const newDidState: DidState | undefined = await this.applyFirstValidOperation(operationsWithCorrectRevealValue, didState, commitValuesUsed);

      // We are done if we can't find a valid update operation to apply.
      if (newDidState === undefined) {
        break;
      }

      // We reach here if we have successfully computed a new DID state.
      // Record the commit value so that it is not used again.
      commitValuesUsed.add(didState.nextUpdateCommitmentHash!);
      didState = newDidState;
    }

    return didState;
  }

  /**
   * Applies the given operation to the given DID state.
   * @param operation The operation to be applied.
   * @param didState The DID state to apply the operation on top of.
   * @returns The resultant `DidState`. undefined if the given operation cannot be applied.
   */
  private async applyOperation (
    operation: AnchoredOperationModel,
    didState: DidState | undefined
  ): Promise<DidState | undefined> {
    // NOTE: MUST NOT throw error, else a bad operation can be used to denial resolution for a DID.
    let appliedDidState;
    try {
      const operationProcessor = this.versionManager.getOperationProcessor(operation.transactionTime);
      appliedDidState = await operationProcessor.apply(operation, didState);
    } catch (error) {
      Logger.info(`Skipped bad operation for DID ${operation.didUniqueSuffix} at time ${operation.transactionTime}. Error: ${SidetreeError.stringify(error)}`);
    }

    return appliedDidState;
  }

  /**
   * @returns The new DID State if a valid operation is applied, `undefined` otherwise.
   */
  private async applyFirstValidOperation (
    operations: AnchoredOperationModel[],
    originalDidState: DidState,
    commitValuesUsed: Set<string>
  ): Promise<DidState | undefined> {
    // Stop as soon as an operation is applied successfully.
    for (const operation of operations) {
      const newDidState = await this.applyOperation(operation, originalDidState);

      // If operation application is unsuccessful, try the next operation.
      if (newDidState === undefined) {
        continue;
      }

      // If the new DID state is referencing an already applied commit-reveal pair,
      // then we must discard this "new DID state" as invalid, and move on to try the next operation.
      // NOTE: Ideally we should perform this check BEFORE attempting applying the operation to the existing DID state,
      // but the way the code is setup currently it is not easy to do. This optimization could be easier once the refactoring work below is done:
      // TODO: https://github.com/decentralized-identity/sidetree/issues/442
      if (Resolver.isCommitValueReused(operation.type, originalDidState, newDidState, commitValuesUsed)) {
        continue;
      }

      // Code reaches here if operation application is successful and commit-reveal pair is not reused.
      return newDidState;
    }

    // Else we reach the end of operations without being able to apply any of them.
    return undefined;
  }

  /**
   * Checks if the new DID state references a commitment hash that is already in use.
   */
  private static isCommitValueReused (operationType: OperationType, oldDidState: DidState, newDidState: DidState, commitValuesUsed: Set<string>): boolean {
    if (operationType === OperationType.Update) {
      return this.isUpdateCommitValueReused(oldDidState, newDidState, commitValuesUsed);
    } else { // Recovery/Deactivate path.
      return this.isRecoverCommitValueReused(oldDidState, newDidState, commitValuesUsed);
    }
  }

  /**
   * Checks if the new DID state references an update commitment hash that is already in use.
   */
  private static isUpdateCommitValueReused (oldDidState: DidState, newDidState: DidState, commitValuesUsed: Set<string>): boolean {
    if (newDidState.nextUpdateCommitmentHash !== undefined && // This check is optional in pure JavaScript, but required for strongly typed Set in TypeScript.
        commitValuesUsed.has(newDidState.nextUpdateCommitmentHash)) {
      return true;
    }

    // Edge condition where the operation re-references the commitment hash that its own reveal value hashes to.
    if (newDidState.nextUpdateCommitmentHash === oldDidState.nextUpdateCommitmentHash) {
      return true;
    }

    return false;
  }

  /**
   * Checks if the new DID state references a recover commitment hash that is already in use.
   */
  private static isRecoverCommitValueReused (oldDidState: DidState, newDidState: DidState, commitValuesUsed: Set<string>): boolean {
    if (newDidState.nextRecoveryCommitmentHash !== undefined && // This check is optional in pure JavaScript, but required for strongly typed Set in TypeScript.
        commitValuesUsed.has(newDidState.nextRecoveryCommitmentHash)) {
      return true;
    }

    // Edge condition where the operation re-references the commitment hash that its own reveal value hashes to.
    if (newDidState.nextRecoveryCommitmentHash === oldDidState.nextRecoveryCommitmentHash) {
      return true;
    }

    return false;
  }

  /**
   * Constructs a single commit value -> operation lookup map by hashing each operation's reveal value as key, then adding the result to a map.
   */
  private async constructCommitValueToOperationLookupMap (nonCreateOperations: AnchoredOperationModel[])
    : Promise<Map<string, AnchoredOperationModel[]>> {
    const commitValueToOperationMap = new Map<string, AnchoredOperationModel[]>();

    // Loop through each operation and add an entry to the commit value -> operations map.
    for (const operation of nonCreateOperations) {
      const operationProcessor = this.versionManager.getOperationProcessor(operation.transactionTime);
      const multihashRevealValueBuffer = await operationProcessor.getMultihashRevealValue(operation);
      const multihashRevealValue = Multihash.decode(multihashRevealValueBuffer);
      const commitValue = Multihash.hashThenEncode(multihashRevealValue.hash, multihashRevealValue.algorithm);

      if (commitValueToOperationMap.has(commitValue)) {
        commitValueToOperationMap.get(commitValue)!.push(operation);
      } else {
        commitValueToOperationMap.set(commitValue, [operation]);
      }
    }

    return commitValueToOperationMap;
  }
}

import AnchoredOperationModel from './models/AnchoredOperationModel';
import DidState from './models/DidState';
import IOperationStore from './interfaces/IOperationStore';
import IVersionManager from './interfaces/IVersionManager';
import Multihash from './versions/latest/Multihash';
import OperationType from './enums/OperationType';

/**
 * NOTE: Resolver cannot be versioned because it needs to be aware of `VersionManager` to fetch the versioned operation processor.
 * 
 * @param allSupportedHashAlgorithms All the supported hash algorithms in multihash code.
 */
export default class Resolver {

  public constructor (private versionManager: IVersionManager, private operationStore: IOperationStore, private allSupportedHashAlgorithms: number[]) { }

  /**
   * Resolve the given DID unique suffix to its latest DID state.
   * @param didUniqueSuffix The unique suffix of the DID to resolve. e.g. if 'did:sidetree:abc123' is the DID, the unique suffix would be 'abc123'
   * @returns Final DID state of the DID. Undefined if the unique suffix of the DID is not found or state is not constructable.
   */
  public async resolve (didUniqueSuffix: string): Promise<DidState | undefined> {
    console.info(`Resolving DID unique suffix '${didUniqueSuffix}'...`);

    const operations = await this.operationStore.get(didUniqueSuffix);
    const createOperations = operations.filter(operation => operation.type === OperationType.Create);
    const nonCreateOperations = operations.filter(operation => operation.type !== OperationType.Create);

    // Construct a hash(reveal_value) -> operation map for operations that are NOT creates.
    const hashToOperationsMap = await this.constructCommitToOperationLookupMap(nonCreateOperations, this.allSupportedHashAlgorithms);

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

  /**
   * Constructs a single commit value -> operation lookup map by looping through each supported hash algorithm,
   * hashing each operations as key, then adding the result to a map.
   */
  private async constructCommitToOperationLookupMap (nonCreateOperations: AnchoredOperationModel[], allSupportedHashAlgorithms: number[])
    : Promise<Map<string, AnchoredOperationModel[]>>
  {
    const hashToOperationMap = new Map<string, AnchoredOperationModel[]>();

    // Loop through each supported algorithm and hash each operation.
    for (const hashAlgorithm of allSupportedHashAlgorithms) {

      // Construct a hash(reveal_value) -> operation map for operations that are NOT creates.
      for (const operation of nonCreateOperations) {

        const operationProcessor = this.versionManager.getOperationProcessor(operation.transactionTime);
        const revealValueBuffer = await operationProcessor.getRevealValue(operation);
        const hashOfRevealValue = Multihash.hashThenEncode(revealValueBuffer, hashAlgorithm);

        if (hashToOperationMap.has(hashOfRevealValue)) {
          hashToOperationMap.get(hashOfRevealValue)!.push(operation);
        } else {
          hashToOperationMap.set(hashOfRevealValue, [operation]);
        }
      }
    }

    return hashToOperationMap;
  }
}

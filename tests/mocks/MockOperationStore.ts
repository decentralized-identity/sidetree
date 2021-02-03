import AnchoredOperationModel from '../../lib/core/models/AnchoredOperationModel';
import IOperationStore from '../../lib/core/interfaces/IOperationStore';

/**
 * Compare two operations returning -1, 0, 1 when the first operand
 * is less than, equal, and greater than the second, respectively.
 * Used to sort operations by blockchain 'time' order.
 */
function compareOperation (op1: AnchoredOperationModel, op2: AnchoredOperationModel): number {
  if (op1.transactionNumber < op2.transactionNumber) {
    return -1;
  } else if (op1.transactionNumber > op2.transactionNumber) {
    return 1;
  } else if (op1.operationIndex < op2.operationIndex) {
    return -1;
  } else if (op1.operationIndex > op2.operationIndex) {
    return 1;
  }

  return 0;
}

/**
 * A simple in-memory implementation of operation store.
 */
export default class MockOperationStore implements IOperationStore {
  // Map DID unique suffixes to operations over it stored as an array. The array might be sorted
  // or unsorted by blockchain time order.
  private readonly didToOperations: Map<string, AnchoredOperationModel[]> = new Map();

  // Map DID unique suffixes to a boolean indicating if the operations array for the DID is sorted
  // or not.
  private readonly didUpdatedSinceLastSort: Map<string, boolean> = new Map();

  /**
   * Inserts an operation into the in-memory store.
   */
  private async insert (operation: AnchoredOperationModel): Promise<void> {
    this.ensureDidContainerExist(operation.didUniqueSuffix);
    // Append the operation to the operation array for the did ...
    this.didToOperations.get(operation.didUniqueSuffix)!.push(operation);
    // ... which leaves the array unsorted, so we record this fact
    this.didUpdatedSinceLastSort.set(operation.didUniqueSuffix, true);
  }

  public async insertOrReplace (operations: AnchoredOperationModel[]): Promise<void> {
    for (const operation of operations) {
      await this.insert(operation);
    }
  }

  /**
   * Implements OperationStore.get().
   * Get an iterator that returns all operations with a given
   * didUniqueSuffix ordered by (transactionNumber, operationIndex).
   */
  public async get (didUniqueSuffix: string): Promise<AnchoredOperationModel[]> {
    let didOps = this.didToOperations.get(didUniqueSuffix);

    if (!didOps) {
      return [];
    }

    const updatedSinceLastSort = this.didUpdatedSinceLastSort.get(didUniqueSuffix)!;

    // Sort needed if there was a put operation since last sort.
    if (updatedSinceLastSort) {
      didOps.sort(compareOperation); // in-place sort
      didOps = didOps.filter((elem, index, self) => { // remove duplicates
        return (index === 0) || compareOperation(elem, self[index - 1]) !== 0;
      });
      this.didUpdatedSinceLastSort.set(didUniqueSuffix, false);
    }

    return didOps;
  }

  /**
   * Delete all operations transactionNumber greater than the given transactionNumber.
   */
  public async delete (transactionNumber?: number): Promise<void> {
    if (!transactionNumber) {
      this.didToOperations.clear();
      this.didUpdatedSinceLastSort.clear();
      return;
    }

    // Iterate over all DID and remove operations from corresponding
    // operations array. Remove leaves the original order intact so
    // we do not need to update didUpdatedSinceLastSort
    for (const [, didOps] of this.didToOperations) {
      MockOperationStore.removeOperations(didOps, transactionNumber);
    }
  }

  public async deleteUpdatesEarlierThan (_didUniqueSuffix: string, _transactionNumber: number, _operationIndex: number): Promise<void> { }

  /**
   * Remove operations. A simple linear scan + filter that leaves the
   * original order intact for non-filters operations.
   */
  private static removeOperations (operations: AnchoredOperationModel[], transactionNumber: number) {
    let writeIndex = 0;

    for (let i = 0; i < operations.length; i++) {
      if (operations[i].transactionNumber <= transactionNumber) {
        operations[writeIndex++] = operations[i];
      }
    }

    while (operations.length > writeIndex) {
      operations.pop();
    }
  }

  private ensureDidContainerExist (did: string) {
    if (this.didToOperations.get(did) === undefined) {
      this.didToOperations.set(did, []);
      this.didUpdatedSinceLastSort.set(did, false);
    }
  }
}

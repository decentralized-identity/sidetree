import { getOperationHash, OperationType, WriteOperation } from './Operation';

/**
 * An abstraction of a complete store for operations exposing methods to
 * store and retrieve all operations.
 */
export interface OperationStore {

  /**
   * Store an operation.
   */
  put (operation: WriteOperation): Promise<void>;

  /**
   * Get an iterator that returns all operations with a given
   * did ordered by (transactionNumber, operationIndex).
   *
   */
  get (did: string): Promise<Iterable<WriteOperation>>;

  /**
   * Delete all operations with at least a given transactionNumber.
   */
  delete (transactionNumber?: number): Promise<void>;

}

function compareOperation (op1: WriteOperation, op2: WriteOperation): number {
  if (op1.transactionNumber! < op2.transactionNumber!) {
    return -1;
  } else if (op1.transactionNumber! > op2.transactionNumber!) {
    return 1;
  } else if (op1.operationIndex! < op2.operationIndex!) {
    return -1;
  } else if (op1.operationIndex! > op2.operationIndex!) {
    return 1;
  }

  return 0;
}

/**
 * An abstraction of a *complete* store for operations, exposing methods to store and
 * subsequently retrieve operations using OperationInfo. Internally relies on a
 * cache to lookup recent and/or heavily accessed operations; on a cache miss relies on
 * an expensive CAS lookup to reconstruct the operation.
 */
class OperationStoreImpl {
  private readonly didToOperations: Map<string, Array<WriteOperation>> = new Map();
  private readonly didTouchedSinceLastSort: Map<string, boolean> = new Map();
  private readonly emptyOperationsArray: Array<WriteOperation> = new Array();

  public constructor (private didMethodName: string) {

  }

  /**
   * Store an operation in the store.
   */
  public async put (operation: WriteOperation): Promise<void> {
    const did = this.getDidUniqueSuffix(operation);

    this.ensureDidEntriesExist(did);
    this.didToOperations.get(did)!.push(operation);
    this.didTouchedSinceLastSort.set(did, true);
  }

  /**
   * Get an iterator that returns all operations with a given
   * did ordered by (transactionNumber, operationIndex).
   *
   */
  public async get (did: string): Promise<Iterable<WriteOperation>> {
    let didOps = this.didToOperations.get(did);

    if (!didOps) {
      return this.emptyOperationsArray;
    }

    const touchedSinceLastSort = this.didTouchedSinceLastSort.get(did)!;

    if (touchedSinceLastSort) {
      didOps.sort(compareOperation);
      this.didTouchedSinceLastSort.set(did, false);
    }

    return didOps;
  }

  /**
   * Delete all operations with at least a given transactionNumber.
   */
  public async delete (transactionNumber?: number): Promise<void> {
    if (!transactionNumber) {
      this.didToOperations.clear();
      this.didTouchedSinceLastSort.clear();
      return;
    }

    for (const [, didOps] of this.didToOperations) {
      OperationStoreImpl.removeOperations(didOps, transactionNumber);
    }
  }

  private static removeOperations (operations: Array<WriteOperation>, transactionNumber: number) {
    let writeIndex = 0;

    for (let i = 0 ; i < operations.length ; i++) {
      if (operations[i].transactionNumber! >= transactionNumber) {
        operations[writeIndex++] = operations[i];
      }
    }

    for (let i = writeIndex ; i < operations.length ; i++) {
      operations.pop();
    }
  }

  /**
   * Gets the DID unique suffix of an operation. For create operation, this is the operation hash;
   * for others the DID included with the operation can be used to obtain the unique suffix.
   */
  private getDidUniqueSuffix (operation: WriteOperation): string {
    if (operation.type === OperationType.Create) {
      return getOperationHash(operation);
    } else {
      const didUniqueSuffix = operation.did!.substring(this.didMethodName.length);
      return didUniqueSuffix;
    }
  }

  private ensureDidEntriesExist (did: string) {
    if (this.didToOperations.get(did) === undefined) {
      this.didToOperations.set(did, new Array<WriteOperation>());
      this.didTouchedSinceLastSort.set(did, false);
    }
  }
}

/**
 * Factory function to create an operation store
 */
export function createOperationStore (didMethodName: string) {
  return new OperationStoreImpl(didMethodName);
}

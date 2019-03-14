import { Config, ConfigKey } from './Config';
import { getOperationHash, OperationType, Operation } from './Operation';
import { MongoDbOperationStore } from './MongoDbOperationStore';

/**
 * An abstraction of a complete store for operations exposing methods to
 * put and get operations.
 */
export interface OperationStore {

  /**
   * Initialize the operation store. This method
   * is called once before any of the operations below.
   * @param resuming is the initialization from "scratch" or resuming
   *                 from a previous stored state?
   */
  initialize (resuming: boolean): Promise<void>;

  /**
   * Store an operation.
   */
  put (operation: Operation): Promise<void>;

  /**
   * Get an iterator that returns all operations with a given
   * didUniqueSuffix ordered by (transactionNumber, operationIndex)
   * ascending.
   */
  get (didUniqueSuffix: string): Promise<Iterable<Operation>>;

  /**
   * Delete all operations with transaction number greater than the
   * provided parameter.
   */
  delete (transactionNumber?: number): Promise<void>;

}

/**
 * Types of operation stores that we support.
 */
export enum OperationStoreType {
  InMemory,                      // Basic in-memory operation store
  Mongo                          // MongoDB backend based operation store
}

/**
 * Compare two operations returning -1, 0, 1 when the first operand
 * is less than, equal, and greater than the second, respectively.
 * Used to sort operations by blockchain 'time' order.
 */
function compareOperation (op1: Operation, op2: Operation): number {
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
 * A simple in-memory implementation of operation store.
 */
class InMemoryOperationStoreImpl implements OperationStore {
  // Map DID to operations over it stored as an array. The array might be sorted
  // or unsorted by blockchain time order.
  private readonly didToOperations: Map<string, Array<Operation>> = new Map();

  // Map DID to a boolean indicating if the operations array for the DID is sorted
  // or not.
  private readonly didTouchedSinceLastSort: Map<string, boolean> = new Map();

  private readonly emptyOperationsArray: Array<Operation> = new Array();

  public constructor (private didMethodName: string) {

  }

  /**
   * Initialize the operation store. The implementation
   * is a no op for in-memory operation store.
   */
  public async initialize (resuming: boolean) {
    if (resuming) {
      throw new Error('Resume not supported in in-memory operation store');
    }
  }

  /**
   * Implement OperationStore.put.
   */
  public async put (operation: Operation): Promise<void> {
    const did = this.getDidUniqueSuffix(operation);

    this.ensureDidEntriesExist(did);
    // Append the operation to the operation array for the did ...
    this.didToOperations.get(did)!.push(operation);
    // ... which leaves the array unsorted, so we record this fact
    this.didTouchedSinceLastSort.set(did, true);
  }

  /**
   * Implement OperationStore.put
   * Get an iterator that returns all operations with a given
   * didUniqueSuffix ordered by (transactionNumber, operationIndex).
   *
   */
  public async get (didUniqueSuffix: string): Promise<Iterable<Operation>> {
    let didOps = this.didToOperations.get(didUniqueSuffix);

    if (!didOps) {
      return this.emptyOperationsArray;
    }

    const touchedSinceLastSort = this.didTouchedSinceLastSort.get(didUniqueSuffix)!;

    // Sort needed if there was a put operation since last sort.
    if (touchedSinceLastSort) {
      didOps.sort(compareOperation);       // in-place sort
      this.didTouchedSinceLastSort.set(didUniqueSuffix, false);
    }

    return didOps;
  }

  /**
   * Delete all operations transactionNumber greater than the given transactionNumber.
   */
  public async delete (transactionNumber?: number): Promise<void> {
    if (!transactionNumber) {
      this.didToOperations.clear();
      this.didTouchedSinceLastSort.clear();
      return;
    }

    // Iterate over all DID and remove operations from corresponding
    // operations array. Remove leaves the original order intact so
    // we do not need to update didTouchedSinceLastSort
    for (const [, didOps] of this.didToOperations) {
      InMemoryOperationStoreImpl.removeOperations(didOps, transactionNumber);
    }
  }

  /**
   * Remove operations. A simple linear scan + filter that leaves the
   * original order intact for non-filters operations.
   */
  private static removeOperations (operations: Array<Operation>, transactionNumber: number) {
    let writeIndex = 0;

    for (let i = 0 ; i < operations.length ; i++) {
      if (operations[i].transactionNumber! > transactionNumber) {
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
  private getDidUniqueSuffix (operation: Operation): string {
    if (operation.type === OperationType.Create) {
      return getOperationHash(operation);
    } else {
      const didUniqueSuffix = operation.did!.substring(this.didMethodName.length);
      return didUniqueSuffix;
    }
  }

  private ensureDidEntriesExist (did: string) {
    if (this.didToOperations.get(did) === undefined) {
      this.didToOperations.set(did, new Array<Operation>());
      this.didTouchedSinceLastSort.set(did, false);
    }
  }
}

/**
 * Factory function to create an operation store
 */
export function createOperationStore (config: Config): OperationStore {
  if (config[ConfigKey.OperationStoreType] === 'InMemory') {
    return new InMemoryOperationStoreImpl(config[ConfigKey.DidMethodName]);
  } else if (config[ConfigKey.OperationStoreType] === 'Mongo') {
    return new MongoDbOperationStore(config);
  } else {
    console.log(config);
    throw Error('Unsupported operation store type: ' + config[ConfigKey.OperationStoreType]);
  }
}

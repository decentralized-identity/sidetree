import { Operation } from '../Operation';

/**
 * An abstraction of a complete store for operations exposing methods to
 * put and get operations.
 */
export default interface OperationStore {

  /**
   * Store a batch of operations
   */
  put (operations: Array<Operation>): Promise<void>;

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

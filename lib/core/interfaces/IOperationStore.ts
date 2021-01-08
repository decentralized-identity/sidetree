import AnchoredOperationModel from '../models/AnchoredOperationModel';

/**
 * An abstraction of a complete store for operations exposing methods to
 * put and get operations.
 */
export default interface IOperationStore {

  /**
   * Stores a batch of operations
   * @param operations The list of operations to be stored, where the key of the map is the DID unique suffix.
   */
  put (operations: AnchoredOperationModel[]): Promise<void>;

  /**
   * Gets all operations of the given DID unique suffix in ascending chronological order.
   */
  get (didUniqueSuffix: string): Promise<AnchoredOperationModel[]>;

  /**
   * Deletes all operations with transaction number greater than the provided parameter.
   */
  delete (transactionNumber?: number): Promise<void>;

  /**
   * Deletes all the operations of the given DID earlier than the specified operation.
   */
  deleteUpdatesEarlierThan (didUniqueSuffix: string, transactionNumber: number, operationIndex: number): Promise<void>;
}

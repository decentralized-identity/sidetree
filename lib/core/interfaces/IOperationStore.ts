import AnchoredOperationModel from '../models/AnchoredOperationModel';

/**
 * An abstraction of a complete store for operations exposing methods to
 * put and get operations.
 */
export default interface IOperationStore {

  /**
   * Inserts or replaces the list of anchored operations given.
   * @param operations The list of anchored operations to be inserted or replaced.
   */
  insertOrReplace (operations: AnchoredOperationModel[]): Promise<void>;

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

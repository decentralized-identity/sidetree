import AnchoredOperationModel from '../models/AnchoredOperationModel';
import NamedAnchoredOperationModel from '../models/NamedAnchoredOperationModel';

/**
 * An abstraction of a complete store for operations exposing methods to
 * put and get operations.
 */
export default interface IOperationStore {

  /**
   * Stores a batch of operations
   * @param operations The list of operations to be stored, where the key of the map is the DID unique suffix.
   */
  put (operations: NamedAnchoredOperationModel[]): Promise<void>;

  /**
   * Gets an array of all operations with a given
   * didUniqueSuffix ordered by (transactionNumber, operationIndex)
   * ascending.
   */
  get (didUniqueSuffix: string): Promise<AnchoredOperationModel[]>;

  /**
   * Deletes all operations with transaction number greater than the
   * provided parameter.
   */
  delete (transactionNumber?: number): Promise<void>;
}

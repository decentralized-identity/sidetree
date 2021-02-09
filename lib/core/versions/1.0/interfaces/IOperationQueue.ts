import QueuedOperationModel from '../models/QueuedOperationModel';

/**
 * An abstraction of a queue of operations used by the Batch Writer.
 */
export default interface IOperationQueue {

  /**
   * Places an operation at the tail of the queue.
   * If there is already an operation for the same DID, Sidetree Error is thrown with 'code': 'batch_writer_already_has_operation_for_did'.
   */
  enqueue (didUniqueSuffix: string, operationBuffer: Buffer): Promise<void>;

  /**
   * Removes the given count of operation buffers from the beginning of the queue.
   */
  dequeue (count: number): Promise<QueuedOperationModel[]>;

  /**
   * Fetches the given count of operation buffers from the beginning of the queue without removing them.
   */
  peek (count: number): Promise<QueuedOperationModel[]>;

  /**
   * Checks to see if the queue already contains an operation for the given DID unique suffix.
   */
  contains (didUniqueSuffix: string): Promise<boolean>;

  /**
   * Gets the size of the queue.
   */
  getSize (): Promise<number>;
}

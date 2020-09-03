import IBatchWriter from './IBatchWriter';
import IOperationProcessor from './IOperationProcessor';
import IRequestHandler from './IRequestHandler';
import ITransactionProcessor from './ITransactionProcessor';
import ITransactionSelector from './ITransactionSelector';

/**
 * Defines an interface to return the correct 'version-ed' objects.
 */
export default interface IVersionManager {
  /**
   * Gets the batch writer for the given blockchain time.
   * @param blockchainTime The blockchain time for which the batch writer is needed.
   */
  getBatchWriter (blockchainTime: number): IBatchWriter;

  /**
   * Gets the operation processor for the given blockchain time.
   * @param blockchainTime The blockchain time for which the operation processor is needed.
   */
  getOperationProcessor (blockchainTime: number): IOperationProcessor;

  /**
   * Gets the request handler for the given blockchain time.
   * @param blockchainTime The blockchain time for which the request handler is needed.
   */
  getRequestHandler (blockchainTime: number): IRequestHandler;

  /**
   * Gets the transaction process for the given blockchain time.
   * @param blockchainTime The blockchain time for which the transaction processor is needed.
   */
  getTransactionProcessor (blockchainTime: number): ITransactionProcessor;

  /**
   * Gets the transaction selector for the given blockchain time.
   * @param blockchainTime The blockchain time for which to be filtered
   */
  getTransactionSelector (blockchainTime: number): ITransactionSelector;
}

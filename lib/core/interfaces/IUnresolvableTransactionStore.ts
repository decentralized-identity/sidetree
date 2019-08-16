import TransactionModel from '../../common/models/TransactionModel';

/**
 * An abstraction for the persistence of Sidetree transactions.
 * Used to avoid re-fetching and reprocessing of transactions when the Sidetree node crashes or restarts.
 */
export default interface IUnresolvableTransactionStore {
  /**
   * Records the retry attempts of the given unresolvable transaction.
   */
  recordUnresolvableTransactionFetchAttempt (transaction: TransactionModel): Promise<void>;

  /**
   * Remove the given transaction from the list of unresolvable transactions.
   * No-op if the transaction does not exist in the list of unresolvable transactions.
   */
  removeUnresolvableTransaction (transaction: TransactionModel): Promise<void>;

  /**
   * Gets a list of unresolvable transactions due for retry processing.
   * @param maxReturnCount
   *   The maximum count of unresolvable transactions to return retry.
   *   If not given, the implementation determines the number of unresolvable transactions to return.
   */
  getUnresolvableTransactionsDueForRetry (maxReturnCount?: number): Promise<TransactionModel[]>;

  /**
   * Remove all unresolvable transactions with transaction number greater than the provided parameter.
   * If `undefined` is given, remove all transactions.
   */
  removeUnresolvableTransactionsLaterThan (transactionNumber?: number): Promise<void>;
}

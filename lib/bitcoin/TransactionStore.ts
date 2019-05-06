import { ITransaction } from '../Transaction';

/**
 * An abstraction for the caching transactions that have been found on the blockchain.
 */
export interface TransactionStore {
  /**
   * Idempotent method that adds the given transaction to the list of transactions.
   */
  addTransaction (transaction: ITransaction): Promise<void>;

  /**
   * Gets the most recent transaction. Returns undefined if there is no transaction.
   */
  getLastTransaction (): Promise<ITransaction | undefined>;

  /**
   * Gets a list of exponentially-spaced processed transactions in reverse direction of the list of processed transactions
   * where the first element in the returned list is the last transaction in the list of processed transactions.
   */
  getExponentiallySpacedTransactions (): Promise<ITransaction[]>;

  /**
   * Returns the specified transaction.
   * @param transactionNumber Transaction number of the transaction to be returned.
   */
  getTransaction (transactionNumber: number): Promise<ITransaction | undefined>;

  /**
   * Returns at most @param max transactions with transactionNumber greater than @param transactionNumber
   * If @param transactionNumber is undefined, returns transactions from index 0 in the store
   */
  getTransactionsLaterThan (transactionNumber: number | undefined, max: number): Promise<ITransaction[]>;

  /**
   * Remove all transactions with transaction number greater than the provided parameter.
   * If `undefined` is given, remove all transactions.
   */
  removeTransactionsLaterThan (transactionNumber?: number): Promise<void>;
}

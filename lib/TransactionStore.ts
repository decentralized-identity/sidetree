import SortedArray from './util/SortedArray';
import Transaction from './Transaction';

/**
 * An abstraction for the persistence of transactions that have been processed.
 * Needed to avoidre-fetching and reprocessing of transactions when the Sidetree node crashes or restarts.
 */
export interface TransactionStore {

  /**
   * Idempotent method that addes the given transaction to the list of processed transactions.
   */
  addProcessedTransaction (transaction: Transaction): Promise<void>;

  /**
   * Gets the most recently processed transaction. Returns undefined if there is no processed transaction.
   */
  getLastTransaction (): Promise<Transaction | undefined>;

  /**
   * Gets a list of exponentially-spaced processed transactions in reverse direction of the list of processed transactions
   * where the first element in the returned list is the last transaction in the list of processed transactions.
   */
  getExponentiallySpacedTransactions (): Promise<Transaction[]>;

  /**
   * Records the retry attempts of the given resolvable transaction.
   */
  recordUnresolvableTransactionFetchAttempt (transaction: Transaction): Promise<void>;

  /**
   * Remove the given transaction from the list of unresolvable transactions.
   * No-op if the transaction does not exist in the list of unresolvable transactions.
   */
  removeUnresolvableTransaction (transaction: Transaction): Promise<void>;

  /**
   * Gets a list of unresolvable transactions due for retry processing.
   * @param maxReturnCount
   *   The maximum count of unresolvable transactions to return retry.
   *   If not given, the implementation determines the number of unresolvable transactions to return.
   */
  getUnresolvableTransactionsDueForRetry (maxReturnCount?: number): Promise<Transaction[]>;

  /**
   * Remove all processed transactions and unresolvable transactions with transaction number greater than the
   * provided parameter.
   * If `undefined` is given, remove all transactions.
   */
  removeTransactionsLaterThan (transactionNumber?: number): Promise<void>;
}

interface UnresolvableTransaction {
  transaction: Transaction;
  firstFetchTime: number;
  retryAttempts: number;
  nextRetryTime: number;
}

/**
 * In-memory implementation of the `TransactionStore`.
 */
export class InMemoryTransactionStore implements TransactionStore {
  private processedTransactions: Transaction[] = [];
  private unresolvableTransactions: Map<number, UnresolvableTransaction> = new Map();

  async addProcessedTransaction (transaction: Transaction): Promise<void> {
    const lastTransaction = await this.getLastTransaction();

    // If the last transaction is later or equal to the transaction to add,
    // then we know this is a transaction previously processed, so no need to add it again.
    if (lastTransaction && lastTransaction.transactionNumber >= transaction.transactionNumber) {
      return;
    }

    this.processedTransactions.push(transaction);
  }

  async getLastTransaction (): Promise<Transaction | undefined> {
    if (this.processedTransactions.length === 0) {
      return undefined;
    }

    const lastProcessedTransactionIndex = this.processedTransactions.length - 1;
    const lastProcessedTransaction = this.processedTransactions[lastProcessedTransactionIndex];
    return lastProcessedTransaction;
  }

  async getExponentiallySpacedTransactions (): Promise<Transaction[]> {
    const exponentiallySpacedTransactions: Transaction[] = [];
    let index = this.processedTransactions.length - 1;
    let distance = 1;
    while (index >= 0) {
      exponentiallySpacedTransactions.push(this.processedTransactions[index]);
      index -= distance;
      distance *= 2;
    }
    return exponentiallySpacedTransactions;
  }

  async recordUnresolvableTransactionFetchAttempt (transaction: Transaction): Promise<void> {
    const unresolvableTransaction = this.unresolvableTransactions.get(transaction.transactionNumber);

    if (unresolvableTransaction === undefined) {
      const unresolvableTransaction = {
        transaction,
        firstFetchTime: Date.now(),
        retryAttempts: 0,
        nextRetryTime: Date.now()
      };

      this.unresolvableTransactions.set(transaction.transactionNumber, unresolvableTransaction);
    } else {
      unresolvableTransaction.retryAttempts++;

      // Exponentially delay the retry the more attempts are done in the past.
      const exponentialFactorInMilliseconds = 60000;
      const requiredElapsedTimeSinceFirstFetchBeforeNextRetry = Math.pow(2, unresolvableTransaction.retryAttempts) * exponentialFactorInMilliseconds;
      const requiredElapsedTimeInSeconds = requiredElapsedTimeSinceFirstFetchBeforeNextRetry / 1000;
      console.info(`Required elapsed time before retry for anchor file ${transaction.anchorFileHash} is now ${requiredElapsedTimeInSeconds} seconds.`);
      unresolvableTransaction.nextRetryTime = unresolvableTransaction.firstFetchTime + requiredElapsedTimeSinceFirstFetchBeforeNextRetry;
    }
  }

  async removeUnresolvableTransaction (transaction: Transaction): Promise<void> {
    this.unresolvableTransactions.delete(transaction.transactionNumber);
  }

  async getUnresolvableTransactionsDueForRetry (): Promise<Transaction[]> {
    const now = Date.now();
    const unresolvableTransactionsToRetry = [];

    // Iterate to get all unresolvable transactions that are due for retrying.
    for (const value of this.unresolvableTransactions.values()) {
      // Calculate the expected next time of retry.
      if (now > value.nextRetryTime) {
        unresolvableTransactionsToRetry.push(value.transaction);
      }
    }

    return unresolvableTransactionsToRetry;
  }

  async removeTransactionsLaterThan (transactionNumber?: number): Promise<void> {
    // If given `undefined`, remove all transactions.
    if (transactionNumber === undefined) {
      this.processedTransactions = [];
      this.unresolvableTransactions = new Map();
      return;
    }

    this.removeAllUnresolvableTransactionsGreaterThan(transactionNumber);

    // Locate the index of the given transaction using binary search.
    const compareTransactionAndTransactionNumber
      = (transaction: Transaction, transactionNumber: number) => { return transaction.transactionNumber - transactionNumber; };
    const bestKnownValidRecentProcessedTransactionIndex
      = SortedArray.binarySearch(this.processedTransactions, transactionNumber, compareTransactionAndTransactionNumber);

    // The following conditions should never be possible.
    if (bestKnownValidRecentProcessedTransactionIndex === undefined) {
      throw Error(`Unable to locate processed transction: ${transactionNumber}`);
    }

    console.info(`Reverting ${this.processedTransactions.length - bestKnownValidRecentProcessedTransactionIndex - 1} transactions...`);
    this.processedTransactions.splice(bestKnownValidRecentProcessedTransactionIndex + 1);
  }

  /**
   * Gets the list of processed transactions.
   * Mainly used for test purposes.
   */
  public getProcessedTransactions (): Transaction[] {
    return this.processedTransactions;
  }

  /**
   * Removes all the unresolved transaction that came later than the given transaction number.
   */
  private removeAllUnresolvableTransactionsGreaterThan (transactionNumber: number) {
    // Find all unresolvable transactions greater than the given transaction number.
    const invalidUnresolvableTransactionNumbers = [];
    for (const key of this.unresolvableTransactions.keys()) {
      if (key > transactionNumber) {
        invalidUnresolvableTransactionNumbers.push(key);
      }
    }

    // Remove every invalid unresolvable transactions.
    for (const key of invalidUnresolvableTransactionNumbers) {
      this.unresolvableTransactions.delete(key);
    }
  }
}

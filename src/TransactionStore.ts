import SortedArray from './lib/SortedArray';
import Transaction from './Transaction';
import { Response, ResponseStatus } from './Response';

/**
 * An abstraction for the caching transactions that have been found on the blockchain.
 */
export interface TransactionStore {

  /**
   * Returns the number of transactions in the store
   */
  getTransactionsCount (): Promise<number>;

  /**
   * Idempotent method that adds the given transaction to the list of transactions.
   */
  addTransaction (transaction: Transaction): Promise<void>;

  /**
   * Gets the most recent transaction. Returns undefined if there is no transaction.
   */
  getLastTransaction (): Promise<Transaction | undefined>;

  /**
   * Gets a list of exponentially-spaced processed transactions in reverse direction of the list of processed transactions
   * where the first element in the returned list is the last transaction in the list of processed transactions.
   */
  getExponentiallySpacedTransactions (): Promise<Transaction[]>;

  /**
   * Returns a transaction from the cache at the requested index
   * @param index The location of the requested transaction
   */
  getTransaction (index: number): Promise<Transaction | undefined>;

  /**
   * Locates a transactionNumber in the transactionStore using binary search
   * @param transactionNumber The transactionNumber for which the index is requested
   */
  locateTransactionIndex (transactionNumber: number): Promise<number | undefined>;

  /**
   * Returns at most @param max transactions with transactionNumber greater than @param transactionNumber
   * If @param transactionNumber is undefined, returns transactions from index 0 in the store
   */
  getTransactionsLaterThan (max: number, transactionNumber?: number): Promise<Response>;

  /**
   * Remove all transactions with transaction number greater than the provided parameter.
   * If `undefined` is given, remove all transactions.
   */
  removeTransactionsLaterThan (transactionNumber?: number): Promise<void>;
}

/**
 * In-memory implementation of the `TransactionStore`.
 */
export class InMemoryTransactionStore implements TransactionStore {
  private transactions: Transaction[] = [];

  async getTransactionsCount (): Promise<number> {
    return this.transactions.length;
  }

  async addTransaction (transaction: Transaction): Promise<void> {
    const lastTransaction = await this.getLastTransaction();

    // If the last transaction is later or equal to the transaction to add,
    // then we know this is a transaction previously processed, so no need to add it again.
    if (lastTransaction && lastTransaction.transactionNumber >= transaction.transactionNumber) {
      return;
    }

    this.transactions.push(transaction);
  }

  async getLastTransaction (): Promise<Transaction | undefined> {
    if (this.transactions.length === 0) {
      return undefined;
    }

    const lastTransactionIndex = this.transactions.length - 1;
    const lastTransaction = this.transactions[lastTransactionIndex];
    return lastTransaction;
  }

  async getExponentiallySpacedTransactions (): Promise<Transaction[]> {
    const exponentiallySpacedTransactions: Transaction[] = [];
    let index = this.transactions.length - 1;
    let distance = 1;
    while (index >= 0) {
      exponentiallySpacedTransactions.push(this.transactions[index]);
      index -= distance;
      distance *= 2;
    }
    return exponentiallySpacedTransactions;
  }

  /**
   * Returns a transaction from the cache at the requested index
   * @param index The location of the requested transaction
   */
  async getTransaction (index: number): Promise<Transaction | undefined> {
    if (index >= this.transactions.length) {
      return undefined;
    } else {
      return this.transactions[index];
    }
  }

  /**
   * Locates a transactionNumber in the transactionStore using binary search
   * @param transactionNumber The transactionNumber for which the index is requested
   */
  async locateTransactionIndex (transactionNumber: number): Promise<number | undefined> {
    // Locate the index of the given transaction using binary search.
    const compareTransactionAndTransactionNumber
      = (transaction: Transaction, transactionNumber: number) => { return transaction.transactionNumber - transactionNumber; };
    const transactionIndex
      = SortedArray.binarySearch(this.transactions, transactionNumber, compareTransactionAndTransactionNumber);
    return transactionIndex;
  }

  /**
   * Returns at most @param max transactions with transactionNumber greater than @param transactionNumber
   * If @param transactionNumber is undefined, returns transactions from index 0 in the store
   */
  async getTransactionsLaterThan (max: number, transactionNumber?: number): Promise<Response> {

    let startIndex = 0;

    // If given `undefined`, return from index 0
    if (transactionNumber === undefined) {
      startIndex = 0;
    } else {
      // Locate the index of the given transaction using binary search.
      const bestKnownValidRecentTransactionIndex = await this.locateTransactionIndex(transactionNumber);

      // The following condition occurs if there was a blockchain reorganization
      if (bestKnownValidRecentTransactionIndex === undefined) {
        return {
          'status': ResponseStatus.BadRequest,
          'body': {
            'transactions': []
          }
        };
      } else {
        startIndex = bestKnownValidRecentTransactionIndex + 1;
      }

    }

    let responseTransactions = [];
    let i = startIndex;
    do {
      if (i >= this.transactions.length) {
        break;
      }

      responseTransactions.push(this.transactions[i]);

      if (responseTransactions.length >= max) {
        break;
      }
      i = i + 1;
    } while (true);

    return {
      'status': ResponseStatus.Succeeded,
      'body': {
        'transactions': responseTransactions
      }
    };
  }

  async removeTransactionsLaterThan (transactionNumber?: number): Promise<void> {
    // If given `undefined`, remove all transactions.
    if (transactionNumber === undefined) {
      this.transactions = [];
      return;
    }

    // Locate the index of the given transaction using binary search.
    const bestKnownValidRecentTransactionIndex = await this.locateTransactionIndex(transactionNumber);

    // The following conditions should never be possible.
    if (bestKnownValidRecentTransactionIndex === undefined) {
      throw Error(`Unable to locate transction: ${transactionNumber}`);
    } else {
      console.info(`Reverting ${this.transactions.length - bestKnownValidRecentTransactionIndex - 1} transactions...`);
      this.transactions.splice(bestKnownValidRecentTransactionIndex + 1);
    }
  }
}

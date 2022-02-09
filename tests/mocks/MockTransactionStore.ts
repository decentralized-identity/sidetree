import ITransactionStore from '../../lib/core/interfaces/ITransactionStore';
import IUnresolvableTransactionStore from '../../lib/core/interfaces/IUnresolvableTransactionStore';
import SortedArray from '../core/util/SortedArray';
import TransactionModel from '../../lib/common/models/TransactionModel';

interface IUnresolvableTransactionInternal {
  transaction: TransactionModel;
  firstFetchTime: number;
  retryAttempts: number;
  nextRetryTime: number;
}

/**
 * In-memory implementation of the `TransactionStore`.
 */
export default class MockTransactionStore implements ITransactionStore, IUnresolvableTransactionStore {
  private processedTransactions: TransactionModel[] = [];
  private unresolvableTransactions: Map<number, IUnresolvableTransactionInternal> = new Map();

  async addTransaction (transaction: TransactionModel): Promise<void> {
    const lastTransaction = await this.getLastTransaction();

    // If the last transaction is later or equal to the transaction to add,
    // then we know this is a transaction previously processed, so no need to add it again.
    if (lastTransaction && lastTransaction.transactionNumber >= transaction.transactionNumber) {
      return;
    }

    this.processedTransactions.push(transaction);
  }

  async getLastTransaction (): Promise<TransactionModel | undefined> {
    if (this.processedTransactions.length === 0) {
      return undefined;
    }

    const lastProcessedTransactionIndex = this.processedTransactions.length - 1;
    const lastProcessedTransaction = this.processedTransactions[lastProcessedTransactionIndex];
    return lastProcessedTransaction;
  }

  async getExponentiallySpacedTransactions (): Promise<TransactionModel[]> {
    const exponentiallySpacedTransactions: TransactionModel[] = [];
    let index = this.processedTransactions.length - 1;
    let distance = 1;
    while (index >= 0) {
      exponentiallySpacedTransactions.push(this.processedTransactions[index]);
      index -= distance;
      distance *= 2;
    }
    return exponentiallySpacedTransactions;
  }

  public async getTransaction (_transactionNumber: number): Promise<TransactionModel | undefined> {
    throw new Error('Not implemented.');
  }

  public async getTransactionsLaterThan (transactionNumber: number | undefined, max: number | undefined): Promise<TransactionModel[]> {
    let transactions = this.processedTransactions;
    if (transactionNumber !== undefined) {
      transactions = transactions.filter(entry => entry.transactionTime > transactionNumber);
    }
    if (max !== undefined) {
      transactions = transactions.slice(0, max);
    }

    return transactions;
  }

  async recordUnresolvableTransactionFetchAttempt (transaction: TransactionModel): Promise<void> {
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
      const anchorString = transaction.anchorString;
      const transactionNumber = transaction.transactionNumber;
      console.info(`Record transaction ${transactionNumber} with anchor string ${anchorString} to retry after ${requiredElapsedTimeInSeconds} seconds.`);
      unresolvableTransaction.nextRetryTime = unresolvableTransaction.firstFetchTime + requiredElapsedTimeSinceFirstFetchBeforeNextRetry;
    }
  }

  async removeUnresolvableTransaction (transaction: TransactionModel): Promise<void> {
    this.unresolvableTransactions.delete(transaction.transactionNumber);
  }

  async getUnresolvableTransactionsDueForRetry (): Promise<TransactionModel[]> {
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
      return;
    }

    // Locate the index of the given transaction using binary search.
    const compareTransactionAndTransactionNumber =
      (transaction: TransactionModel, transactionNumber: number) => { return transaction.transactionNumber - transactionNumber; };
    const bestKnownValidRecentProcessedTransactionIndex =
      SortedArray.binarySearch(this.processedTransactions, transactionNumber, compareTransactionAndTransactionNumber);

    // The following conditions should never be possible.
    if (bestKnownValidRecentProcessedTransactionIndex === undefined) {
      throw Error(`Unable to locate processed transaction: ${transactionNumber}`);
    }

    console.info(`Reverting ${this.processedTransactions.length - bestKnownValidRecentProcessedTransactionIndex - 1} transactions...`);
    this.processedTransactions.splice(bestKnownValidRecentProcessedTransactionIndex + 1);
  }

  async removeUnresolvableTransactionsLaterThan (transactionNumber?: number): Promise<void> {
    // If given `undefined`, remove all unresolvable transactions.
    if (transactionNumber === undefined) {
      this.unresolvableTransactions = new Map();
      return;
    }

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

  /**
   * Gets the list of transactions.
   * Mainly used for test purposes.
   */
  public getTransactions (): TransactionModel[] {
    return this.processedTransactions;
  }

  public async getTransactionsStartingFrom (inclusiveBeginTransactionTime: number, exclusiveEndTransactionTime: number): Promise<TransactionModel[]> {
    if (inclusiveBeginTransactionTime === exclusiveEndTransactionTime) {
      return this.processedTransactions.filter((transaction) => { return transaction.transactionTime === inclusiveBeginTransactionTime; });
    } else {
      return this.processedTransactions.filter((transaction) => {
        return transaction.transactionTime >= inclusiveBeginTransactionTime &&
        transaction.transactionTime < exclusiveEndTransactionTime;
      });
    }
  }
}

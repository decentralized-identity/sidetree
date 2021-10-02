import IUnresolvableTransactionStore from './interfaces/IUnresolvableTransactionStore';
import Logger from '../common/Logger';
import { Long } from 'mongodb';
import MongoDbStore from '../common/MongoDbStore';
import TransactionModel from '../common/models/TransactionModel';
import UnresolvableTransactionModel from './models/UnresolvableTransactionModel';

/**
 * Implementation of `IUnresolvableTransactionStore` that stores the transaction data in a MongoDB database.
 */
export default class MongoDbUnresolvableTransactionStore extends MongoDbStore implements IUnresolvableTransactionStore {
  /** Collection name for unresolvable transactions. */
  public static readonly unresolvableTransactionCollectionName: string = 'unresolvable-transactions';

  private exponentialDelayFactorInMilliseconds = 60000;
  private maximumUnresolvableTransactionReturnCount = 100;

  /**
   * Creates a new instance of this object.
   * @param serverUrl The target server url.
   * @param databaseName The database name where the collection should be saved.
   * @param retryExponentialDelayFactor
   *   The exponential delay factor in milliseconds for retries of unresolvable transactions.
   *   e.g. if it is set to 1 seconds, then the delays for retries will be 1 second, 2 seconds, 4 seconds... until the transaction can be resolved.
   */
  public constructor (
    serverUrl: string,
    databaseName: string,
    retryExponentialDelayFactor?: number) {
    super(serverUrl, MongoDbUnresolvableTransactionStore.unresolvableTransactionCollectionName, databaseName);
    if (retryExponentialDelayFactor !== undefined) {
      this.exponentialDelayFactorInMilliseconds = retryExponentialDelayFactor;
    }
  }

  public async recordUnresolvableTransactionFetchAttempt (transaction: TransactionModel): Promise<void> {
    // Try to get the unresolvable transaction from store.
    const transactionTime = transaction.transactionTime;
    const transactionNumber = transaction.transactionNumber;
    const searchFilter = { transactionTime, transactionNumber: Long.fromNumber(transactionNumber) };
    const findResults = await this.collection!.find(searchFilter).toArray();
    let unresolvableTransaction: UnresolvableTransactionModel | undefined;
    if (findResults && findResults.length > 0) {
      unresolvableTransaction = findResults[0];
    }

    // If unresolvable transaction not found in store, insert a new one; else update the info on retry attempts.
    if (unresolvableTransaction === undefined) {
      const newUnresolvableTransaction = {
        anchorString: transaction.anchorString,
        transactionTime,
        transactionNumber: Long.fromNumber(transactionNumber),
        transactionTimeHash: transaction.transactionTimeHash,
        transactionFeePaid: transaction.transactionFeePaid,
        normalizedTransactionFee: transaction.normalizedTransactionFee,
        writer: transaction.writer,
        // Additional properties used for retry logic below.
        firstFetchTime: Date.now(),
        retryAttempts: 0,
        nextRetryTime: Date.now()
      };

      await this.collection!.insertOne(newUnresolvableTransaction);
    } else {
      const retryAttempts = unresolvableTransaction.retryAttempts + 1;

      // Exponentially delay the retry the more attempts are done in the past.
      const anchorString = transaction.anchorString;
      const requiredElapsedTimeSinceFirstFetchBeforeNextRetry = Math.pow(2, unresolvableTransaction.retryAttempts) * this.exponentialDelayFactorInMilliseconds;
      const requiredElapsedTimeInSeconds = requiredElapsedTimeSinceFirstFetchBeforeNextRetry / 1000;
      Logger.info(`Record transaction ${transactionNumber} with anchor string ${anchorString} to retry after ${requiredElapsedTimeInSeconds} seconds.`);
      const nextRetryTime = unresolvableTransaction.firstFetchTime + requiredElapsedTimeSinceFirstFetchBeforeNextRetry;

      const searchFilter = { transactionTime, transactionNumber: Long.fromNumber(transactionNumber) };
      await this.collection!.updateOne(searchFilter, { $set: { retryAttempts, nextRetryTime } });
    }
  }

  public async removeUnresolvableTransaction (transaction: TransactionModel): Promise<void> {
    const transactionTime = transaction.transactionTime;
    const transactionNumber = transaction.transactionNumber;
    await this.collection!.deleteOne({ transactionTime, transactionNumber: Long.fromNumber(transactionNumber) });
  }

  public async getUnresolvableTransactionsDueForRetry (maximumReturnCount?: number): Promise<TransactionModel[]> {
    // Override the return count if it is specified.
    let returnCount = this.maximumUnresolvableTransactionReturnCount;
    if (maximumReturnCount !== undefined) {
      returnCount = maximumReturnCount;
    }

    const now = Date.now();
    const unresolvableTransactionsToRetry =
      await this.collection!.find({ nextRetryTime: { $lte: now } }).sort({ nextRetryTime: 1 }).limit(returnCount).toArray();

    return unresolvableTransactionsToRetry;
  }

  public async removeUnresolvableTransactionsLaterThan (transactionNumber?: number): Promise<void> {
    // If given `undefined`, remove all transactions.
    if (transactionNumber === undefined) {
      await this.clearCollection();
      return;
    }

    await this.collection!.deleteMany({ transactionNumber: { $gt: Long.fromNumber(transactionNumber) } });
  }

  /**
   * Gets the list of unresolvable transactions.
   * Mainly used for test purposes.
   */
  public async getUnresolvableTransactions (): Promise<UnresolvableTransactionModel[]> {
    const transactions = await this.collection!.find().sort({ transactionTime: 1, transactionNumber: 1 }).toArray();
    return transactions;
  }

  /**
   * @inheritDoc
   */
  public async createIndex (): Promise<void> {
    await this.collection.createIndex({ transactionTime: 1, transactionNumber: 1 }, { unique: true });
    await this.collection.createIndex({ nextRetryTime: 1 });
  }
}

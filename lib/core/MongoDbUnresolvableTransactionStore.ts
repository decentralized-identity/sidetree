import { Collection, Db, Long, MongoClient } from 'mongodb';
import IUnresolvableTransactionStore from './interfaces/IUnresolvableTransactionStore';
import TransactionModel from '../common/models/TransactionModel';

interface IUnresolvableTransaction extends TransactionModel {
  firstFetchTime: number;
  retryAttempts: number;
  nextRetryTime: number;
}

/**
 * Implementation of `IIUnresolvableTransactionStore` that stores the transaction data in a MongoDB database.
 */
export default class MongoDbUnresolvableTransactionStore implements IUnresolvableTransactionStore {
  /** Default database name used if not specified in constructor. */
  public static readonly defaultDatabaseName: string = 'sidetree';
  /** Collection name for unresolvable transactions. */
  public static readonly unresolvableTransactionCollectionName: string = 'unresolvable-transactions';
  /** Database name used by this transaction store. */
  public readonly databaseName: string;

  private exponentialDelayFactorInMilliseconds = 60000;
  private maximumUnresolvableTransactionReturnCount = 100;

  private db: Db | undefined;
  private unresolvableTransactionCollection: Collection<any> | undefined;

  /**
   * Constructs a `MongoDbUnresolvableTransactionStore`;
   * @param retryExponentialDelayFactor
   *   The exponential delay factor in milliseconds for retries of unresolvable transactions.
   *   e.g. if it is set to 1 seconds, then the delays for retries will be 1 second, 2 seconds, 4 seconds... until the transaction can be resolved.
   */
  constructor (private serverUrl: string, databaseName?: string, retryExponentialDelayFactor?: number) {
    this.databaseName = databaseName ? databaseName : MongoDbUnresolvableTransactionStore.defaultDatabaseName;

    if (retryExponentialDelayFactor !== undefined) {
      this.exponentialDelayFactorInMilliseconds = retryExponentialDelayFactor;
    }
  }

  /**
   * Initialize the MongoDB unresolvable transaction store.
   */
  public async initialize (): Promise<void> {
    const client = await MongoClient.connect(this.serverUrl, { useNewUrlParser: true }); // `useNewUrlParser` addresses nodejs's URL parser deprecation warning.
    this.db = client.db(this.databaseName);
    this.unresolvableTransactionCollection = await MongoDbUnresolvableTransactionStore.createUnresolvableTransactionCollectionIfNotExist(this.db);
  }

  /**
   * * Clears the unresolvable transaction store.
   */
  public async clearCollection () {
    // NOTE: We avoid implementing this by deleting and recreating the collection in rapid succession,
    // because doing so against some cloud MongoDB services such as CosmosDB,
    // especially in rapid repetition that can occur in tests, will lead to `MongoError: ns not found` connectivity error.
    await this.unresolvableTransactionCollection!.deleteMany({ }); // Empty filter removes all entries in collection.
  }

  async recordUnresolvableTransactionFetchAttempt (transaction: TransactionModel): Promise<void> {
    // Try to get the unresolvable transaction from store.
    const transactionTime = transaction.transactionTime;
    const transactionNumber = transaction.transactionNumber;
    const searchFilter = { transactionTime, transactionNumber: Long.fromNumber(transactionNumber) };
    const findResults = await this.unresolvableTransactionCollection!.find(searchFilter).toArray();
    let unresolvableTransaction: IUnresolvableTransaction | undefined;
    if (findResults && findResults.length > 0) {
      unresolvableTransaction = findResults[0];
    }

    // If unresolvable transaction not found in store, insert a new one; else update the info on retry attempts.
    if (unresolvableTransaction === undefined) {
      const newUnresolvableTransaction = {
        transactionTime,
        transactionNumber: Long.fromNumber(transactionNumber),
        anchorString: transaction.anchorString,
        transactionTimeHash: transaction.transactionTimeHash,
        firstFetchTime: Date.now(),
        retryAttempts: 0,
        nextRetryTime: Date.now()
      };

      await this.unresolvableTransactionCollection!.insertOne(newUnresolvableTransaction);
    } else {
      const retryAttempts = unresolvableTransaction.retryAttempts + 1;

      // Exponentially delay the retry the more attempts are done in the past.
      const anchorString = transaction.anchorString;
      const requiredElapsedTimeSinceFirstFetchBeforeNextRetry = Math.pow(2, unresolvableTransaction.retryAttempts) * this.exponentialDelayFactorInMilliseconds;
      const requiredElapsedTimeInSeconds = requiredElapsedTimeSinceFirstFetchBeforeNextRetry / 1000;
      console.info(`Record transaction ${transactionNumber} with anchor string ${anchorString} to retry after ${requiredElapsedTimeInSeconds} seconds.`);
      const nextRetryTime = unresolvableTransaction.firstFetchTime + requiredElapsedTimeSinceFirstFetchBeforeNextRetry;

      const searchFilter = { transactionTime, transactionNumber: Long.fromNumber(transactionNumber) };
      await this.unresolvableTransactionCollection!.updateOne(searchFilter, { $set: { retryAttempts, nextRetryTime } });
    }
  }

  async removeUnresolvableTransaction (transaction: TransactionModel): Promise<void> {
    const transactionTime = transaction.transactionTime;
    const transactionNumber = transaction.transactionNumber;
    await this.unresolvableTransactionCollection!.deleteOne({ transactionTime, transactionNumber: Long.fromNumber(transactionNumber) });
  }

  async getUnresolvableTransactionsDueForRetry (maximumReturnCount?: number): Promise<TransactionModel[]> {
    // Override the return count if it is specified.
    let returnCount = this.maximumUnresolvableTransactionReturnCount;
    if (maximumReturnCount !== undefined) {
      returnCount = maximumReturnCount;
    }

    const now = Date.now();
    const unresolvableTransactionsToRetry =
      await this.unresolvableTransactionCollection!.find({ nextRetryTime: { $lte: now } }).sort({ nextRetryTime: 1 }).limit(returnCount).toArray();

    return unresolvableTransactionsToRetry;
  }

  async removeUnresolvableTransactionsLaterThan (transactionNumber?: number): Promise<void> {
    // If given `undefined`, remove all transactions.
    if (transactionNumber === undefined) {
      await this.clearCollection();
      return;
    }

    await this.unresolvableTransactionCollection!.deleteMany({ transactionNumber: { $gt: Long.fromNumber(transactionNumber) } });
  }

  /**
   * Gets the list of unresolvable transactions.
   * Mainly used for test purposes.
   */
  public async getUnresolvableTransactions (): Promise<IUnresolvableTransaction[]> {
    const transactions = await this.unresolvableTransactionCollection!.find().sort({ transactionTime: 1, transactionNumber: 1 }).toArray();
    return transactions;
  }

  /**
   * Creates the `unresolvable-transaction` collection with indexes if it does not exists.
   * @returns The existing collection if exists, else the newly created collection.
   */
  public static async createUnresolvableTransactionCollectionIfNotExist (db: Db): Promise<Collection<IUnresolvableTransaction>> {
    const collections = await db.collections();
    const collectionNames = collections.map(collection => collection.collectionName);

    // If 'unresolvable transactions' collection exists, use it; else create it.
    let unresolvableTransactionCollection;
    if (collectionNames.includes(MongoDbUnresolvableTransactionStore.unresolvableTransactionCollectionName)) {
      console.info('Unresolvable transaction collection already exists.');
      unresolvableTransactionCollection = db.collection(MongoDbUnresolvableTransactionStore.unresolvableTransactionCollectionName);
    } else {
      console.info('Unresolvable transaction collection does not exists, creating...');
      unresolvableTransactionCollection = await db.createCollection(MongoDbUnresolvableTransactionStore.unresolvableTransactionCollectionName);
      await unresolvableTransactionCollection.createIndex({ transactionTime: 1, transactionNumber: 1 }, { unique: true });
      await unresolvableTransactionCollection.createIndex({ nextRetryTime: 1 });
      console.info('Unresolvable transaction collection created.');
    }

    return unresolvableTransactionCollection;
  }
}

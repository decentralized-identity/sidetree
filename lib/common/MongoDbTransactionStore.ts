import ITransactionStore from '../core/interfaces/ITransactionStore';
import TransactionModel from './models/TransactionModel';
import { Collection, Cursor, Db, Long, MongoClient } from 'mongodb';

/**
 * Implementation of ITransactionStore that stores the transaction data in a MongoDB database.
 */
export default class MongoDbTransactionStore implements ITransactionStore {
  /** Default database name used if not specified in constructor. */
  public static readonly defaultDatabaseName: string = 'sidetree';
  /** Collection name for transactions. */
  public static readonly transactionCollectionName: string = 'transactions';
  /** Database name used by this transaction store. */
  public readonly databaseName: string;

  private db: Db | undefined;
  private transactionCollection: Collection<any> | undefined;

  /**
   * Constructs a `MongoDbTransactionStore`;
   * @param retryExponentialDelayFactor
   *   The exponential delay factor in milliseconds for retries of unresolvable transactions.
   *   e.g. if it is set to 1 seconds, then the delays for retries will be 1 second, 2 seconds, 4 seconds... until the transaction can be resolved.
   */
  constructor (private serverUrl: string, databaseName?: string) {
    this.databaseName = databaseName ? databaseName : MongoDbTransactionStore.defaultDatabaseName;
  }

  /**
   * Initialize the MongoDB transaction store.
   */
  public async initialize (): Promise<void> {
    const client = await MongoClient.connect(this.serverUrl, { useNewUrlParser: true }); // `useNewUrlParser` addresses nodejs's URL parser deprecation warning.
    this.db = client.db(this.databaseName);
    this.transactionCollection = await MongoDbTransactionStore.createTransactionCollectionIfNotExist(this.db);
  }

  /**
   * Returns the number of transactions in the store.
   * Mainly used by tests.
   */
  public async getTransactionsCount (): Promise<number> {
    const transactionCount = await this.transactionCollection!.count();
    return transactionCount;
  }

  public async getTransaction (transactionNumber: number): Promise<TransactionModel | undefined> {
    const transactions = await this.transactionCollection!.find({ transactionNumber: Long.fromNumber(transactionNumber) }).toArray();
    if (transactions.length === 0) {
      return undefined;
    }

    const transaction = transactions[0];
    return transaction;
  }

  public async getTransactionsLaterThan (transactionNumber: number | undefined, max: number | undefined): Promise<TransactionModel[]> {
    let transactions = [];

    try {

      let dbCursor: Cursor<any>;

      // If given `undefined`, return transactions from the start.
      if (transactionNumber === undefined) {
        dbCursor = this.transactionCollection!.find();
      } else {
        dbCursor = this.transactionCollection!.find({ transactionNumber: { $gt: Long.fromNumber(transactionNumber) } });
      }

      // If a limit is defined then set it.
      if (max) {
        dbCursor = dbCursor.limit(max);
      }

      // Sort the output
      dbCursor = dbCursor.sort({ transactionNumber: 1 });

      // Fetch the transactions
      transactions = await dbCursor.toArray();

    } catch (error) {
      console.error(error);
    }

    return transactions;
  }

  /**
   * Clears the transaction store.
   */
  public async clearCollection () {
    // NOTE: We avoid implementing this by deleting and recreating the collection in rapid succession,
    // because doing so against some cloud MongoDB services such as CosmosDB,
    // especially in rapid repetition that can occur in tests, will lead to `MongoError: ns not found` connectivity error.
    await this.transactionCollection!.deleteMany({ }); // Empty filter removes all entries in collection.
  }

  async addTransaction (transaction: TransactionModel): Promise<void> {
    try {
      const transactionInMongoDb = {
        anchorString: transaction.anchorString,
        // NOTE: MUST force `transactionNumber` to be Int64 in MondoDB.
        transactionNumber: Long.fromNumber(transaction.transactionNumber),
        transactionTime: transaction.transactionTime,
        transactionTimeHash: transaction.transactionTimeHash,
        transactionFeePaid: transaction.transactionFeePaid,
        normalizedTransactionFee: transaction.normalizedTransactionFee,
        writer: transaction.writer
      };
      await this.transactionCollection!.insertOne(transactionInMongoDb);
    } catch (error) {
      // Swallow duplicate insert errors (error code 11000) as no-op; rethrow others
      if (error.code !== 11000) {
        throw error;
      }
    }
  }

  async getLastTransaction (): Promise<TransactionModel | undefined> {
    const lastTransactions = await this.transactionCollection!.find().limit(1).sort({ transactionNumber: -1 }).toArray();
    if (lastTransactions.length === 0) {
      return undefined;
    }

    const lastProcessedTransaction = lastTransactions[0];
    return lastProcessedTransaction;
  }

  async getExponentiallySpacedTransactions (): Promise<TransactionModel[]> {
    const exponentiallySpacedTransactions: TransactionModel[] = [];
    const allTransactions = await this.transactionCollection!.find().sort({ transactionNumber: 1 }).toArray();

    let index = allTransactions.length - 1;
    let distance = 1;
    while (index >= 0) {
      exponentiallySpacedTransactions.push(allTransactions[index]);
      index -= distance;
      distance *= 2;
    }
    return exponentiallySpacedTransactions;
  }

  async removeTransactionsLaterThan (transactionNumber?: number): Promise<void> {
    // If given `undefined`, remove all transactions.
    if (transactionNumber === undefined) {
      await this.clearCollection();
      return;
    }

    await this.transactionCollection!.deleteMany({ transactionNumber: { $gt: Long.fromNumber(transactionNumber) } });
  }

  /**
   * Gets the list of processed transactions.
   * Mainly used for test purposes.
   */
  public async getTransactions (): Promise<TransactionModel[]> {
    const transactions = await this.transactionCollection!.find().sort({ transactionNumber: 1 }).toArray();
    return transactions;
  }

  /**
   * Gets a list of transactions between the bounds of transaction time. The smaller value will be inclusive while the bigger be exclusive
   * @param inclusiveBeginTransactionTime The first transaction time to begin querying for
   * @param exclusiveEndTransactionTime The transaction time to stop querying for
   */
  public async getTransactionsStartingFrom (inclusiveBeginTransactionTime: number, exclusiveEndTransactionTime: number): Promise<TransactionModel[]> {
    let cursor: Cursor<any>;
    if (inclusiveBeginTransactionTime === exclusiveEndTransactionTime) {
      // if begin === end, query for 1 transaction time
      cursor = this.transactionCollection!.find({ transactionTime: { $eq: Long.fromNumber(inclusiveBeginTransactionTime) } });
    } else {
      cursor = this.transactionCollection!.find({ $and: [
        { transactionTime: { $gte: Long.fromNumber(inclusiveBeginTransactionTime) } },
        { transactionTime: { $lt: Long.fromNumber(exclusiveEndTransactionTime) } }
      ] });
    }

    const transactions: TransactionModel[] = await cursor.sort({ transactionNumber: 1 }).toArray();
    return transactions;
  }

  /**
   * Creates the `transaction` collection with indexes if it does not exists.
   * @returns The existing collection if exists, else the newly created collection.
   */
  private static async createTransactionCollectionIfNotExist (db: Db): Promise<Collection<TransactionModel>> {
    const collections = await db.collections();
    const collectionNames = collections.map(collection => collection.collectionName);

    // If 'transactions' collection exists, use it; else create it.
    let transactionCollection;
    if (collectionNames.includes(MongoDbTransactionStore.transactionCollectionName)) {
      console.info('Transaction collection already exists.');
      transactionCollection = db.collection(MongoDbTransactionStore.transactionCollectionName);
    } else {
      console.info('Transaction collection does not exists, creating...');
      transactionCollection = await db.createCollection(MongoDbTransactionStore.transactionCollectionName);
      // Note the unique index, so duplicate inserts are rejected.
      await transactionCollection.createIndex({ transactionNumber: 1 }, { unique: true });
      console.info('Transaction collection created.');
    }

    return transactionCollection;
  }
}

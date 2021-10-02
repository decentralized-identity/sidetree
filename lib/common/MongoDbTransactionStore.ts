import { Cursor, Long } from 'mongodb';
import ITransactionStore from '../core/interfaces/ITransactionStore';
import Logger from '../common/Logger';
import MongoDbStore from './MongoDbStore';
import TransactionModel from './models/TransactionModel';

/**
 * Implementation of ITransactionStore that stores the transaction data in a MongoDB database.
 */
export default class MongoDbTransactionStore extends MongoDbStore implements ITransactionStore {
  /** Collection name for transactions. */
  public static readonly transactionCollectionName: string = 'transactions';

  /**
   * Creates a new instance of this object.
   * @param serverUrl The target server url.
   * @param databaseName The database name where the collection should be saved.
   */
  public constructor (
    serverUrl: string,
    databaseName: string) {
    super(serverUrl, MongoDbTransactionStore.transactionCollectionName, databaseName);
  }

  /**
   * Returns the number of transactions in the store.
   * Mainly used by tests.
   */
  public async getTransactionsCount (): Promise<number> {
    const transactionCount = await this.collection!.count();
    return transactionCount;
  }

  public async getTransaction (transactionNumber: number): Promise<TransactionModel | undefined> {
    const transactions = await this.collection!.find({ transactionNumber: Long.fromNumber(transactionNumber) }).toArray();
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
        dbCursor = this.collection!.find();
      } else {
        dbCursor = this.collection!.find({ transactionNumber: { $gt: Long.fromNumber(transactionNumber) } });
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
      Logger.error(error);
    }

    return transactions;
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
      await this.collection!.insertOne(transactionInMongoDb);
    } catch (error) {
      // Swallow duplicate insert errors (error code 11000) as no-op; rethrow others
      if (error.code !== 11000) {
        throw error;
      }
    }
  }

  async getLastTransaction (): Promise<TransactionModel | undefined> {
    const lastTransactions = await this.collection!.find().limit(1).sort({ transactionNumber: -1 }).toArray();
    if (lastTransactions.length === 0) {
      return undefined;
    }

    const lastProcessedTransaction = lastTransactions[0];
    return lastProcessedTransaction;
  }

  async getExponentiallySpacedTransactions (): Promise<TransactionModel[]> {
    const exponentiallySpacedTransactions: TransactionModel[] = [];
    const allTransactions = await this.collection!.find().sort({ transactionNumber: 1 }).toArray();

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

    await this.collection!.deleteMany({ transactionNumber: { $gt: Long.fromNumber(transactionNumber) } });
  }

  /**
   * Remove transactions by transaction time hash
   * @param transactionTimeHash the transaction time hash which the transactions should be removed for
   */
  public async removeTransactionByTransactionTimeHash (transactionTimeHash: string) {
    await this.collection!.deleteMany({ transactionTimeHash: { $eq: transactionTimeHash } });
  }

  /**
   * Gets the list of processed transactions.
   * Mainly used for test purposes.
   */
  public async getTransactions (): Promise<TransactionModel[]> {
    const transactions = await this.collection!.find().sort({ transactionNumber: 1 }).toArray();
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
      cursor = this.collection!.find({ transactionTime: { $eq: Long.fromNumber(inclusiveBeginTransactionTime) } });
    } else {
      cursor = this.collection!.find({
        $and: [
          { transactionTime: { $gte: Long.fromNumber(inclusiveBeginTransactionTime) } },
          { transactionTime: { $lt: Long.fromNumber(exclusiveEndTransactionTime) } }
        ]
      });
    }

    const transactions: TransactionModel[] = await cursor.sort({ transactionNumber: 1 }).toArray();
    return transactions;
  }

  /**
   * @inheritDoc
   */
  public async createIndex (): Promise<void> {
    await this.collection.createIndex({ transactionNumber: 1 }, { unique: true });
  }
}

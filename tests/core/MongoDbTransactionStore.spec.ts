import Config from '../../lib/core/models/Config';
import ITransactionStore from '../../lib/core/interfaces/ITransactionStore';
import MongoDb from '../common/MongoDb';
import MongoDbTransactionStore from '../../lib/common/MongoDbTransactionStore';
import TransactionModel from '../../lib/common/models/TransactionModel';
import { MongoClient } from 'mongodb';

/**
 * Creates a MongoDbTransactionStore and initializes it.
 */
async function createTransactionStore (transactionStoreUri: string, databaseName: string): Promise<MongoDbTransactionStore> {
  const transactionStore = new MongoDbTransactionStore(transactionStoreUri, databaseName);
  await transactionStore.initialize();
  return transactionStore;
}

/**
 * Generates transactions where all the properties are initialized to the 1-based index of the transaction.
 * e.g. First transaction will have all properties assigned as 1 or '1';
 * @param transactionStore The transaction store to store the generated transactions.
 * @param count Number of transactions to generate and store.
 */
async function generateAndStoreTransactions (transactionStore: ITransactionStore, count: number): Promise<TransactionModel[]> {
  const transactions: TransactionModel[] = [];
  for (let i = 1; i <= count; i++) {
    const transaction: TransactionModel = {
      anchorString: i.toString(),
      transactionNumber: i,
      transactionTime: i,
      transactionTimeHash: i.toString()
    };

    await transactionStore.addTransaction(transaction);

    transactions.push(transaction);
  }

  return transactions;
}

describe('MongoDbTransactionStore', async () => {
  const config: Config = require('../json/config-test.json');
  const databaseName = 'sidetree-test';

  let mongoServiceAvailable: boolean | undefined;
  let transactionStore: MongoDbTransactionStore;
  beforeAll(async () => {
    mongoServiceAvailable = await MongoDb.isServerAvailable(config.mongoDbConnectionString);
    if (mongoServiceAvailable) {
      transactionStore = await createTransactionStore(config.mongoDbConnectionString, databaseName);
    }
  });

  beforeEach(async () => {
    if (!mongoServiceAvailable) {
      pending('MongoDB service not available');
    }

    await transactionStore.clearCollection();
  });

  it('should create collections needed on initialization if they do not exist.', async () => {
    console.info(`Deleting collections...`);
    const client = await MongoClient.connect(config.mongoDbConnectionString);
    const db = client.db(databaseName);
    await db.dropCollection(MongoDbTransactionStore.transactionCollectionName);

    console.info(`Verify collections no longer exist.`);
    let collections = await db.collections();
    let collectionNames = collections.map(collection => collection.collectionName);
    expect(collectionNames.includes(MongoDbTransactionStore.transactionCollectionName)).toBeFalsy();

    console.info(`Trigger initialization.`);
    await transactionStore.initialize();

    console.info(`Verify collection exists now.`);
    collections = await db.collections();
    collectionNames = collections.map(collection => collection.collectionName);
    expect(collectionNames.includes(MongoDbTransactionStore.transactionCollectionName)).toBeTruthy();
  });

  it('should not store duplicated transactions.', async () => {
    const transactionCount = 3;
    await generateAndStoreTransactions(transactionStore, transactionCount);

    let transactions = await transactionStore.getTransactions();
    expect(transactions.length).toEqual(transactionCount);

    // Attempt to reinsert the same transaction with the same property values.
    await generateAndStoreTransactions(transactionStore, transactionCount);

    transactions = await transactionStore.getTransactions();
    expect(transactions.length).toEqual(transactionCount);
  });

  it('should be able to get the last transaction.', async () => {
    const transactionCount = 10;
    await generateAndStoreTransactions(transactionStore, transactionCount);

    const lastTransaction = await transactionStore.getLastTransaction();

    expect(lastTransaction).toBeDefined();
    expect(lastTransaction!.transactionNumber).toEqual(transactionCount);
  });

  it('should return undefined if there are no transactions when getting the last transaction.', async () => {
    const lastTransaction = await transactionStore.getLastTransaction();

    expect(lastTransaction).toBeUndefined();
  });

  it('should be able to return exponentially spaced transactions.', async () => {
    const transactionCount = 8;
    await generateAndStoreTransactions(transactionStore, transactionCount);

    // Exponentially spaced transations in reverse chronological order.
    const exponentiallySpacedTransactions = await transactionStore.getExponentiallySpacedTransactions();
    expect(exponentiallySpacedTransactions.length).toEqual(4);
    expect(exponentiallySpacedTransactions[0].transactionNumber).toEqual(8);
    expect(exponentiallySpacedTransactions[1].transactionNumber).toEqual(7);
    expect(exponentiallySpacedTransactions[2].transactionNumber).toEqual(5);
    expect(exponentiallySpacedTransactions[3].transactionNumber).toEqual(1);
  });

  it('should be able to delete transactions greater than a given transaction time.', async () => {
    const transactionCount = 10;
    await generateAndStoreTransactions(transactionStore, transactionCount);

    // Deleting all transactions that are later than transaction number 5.
    await transactionStore.removeTransactionsLaterThan(5);

    // Expecting only transaction 1 & 2 are remaining transactions.
    const remainingTransactions = await transactionStore.getTransactions();
    expect(remainingTransactions.length).toEqual(5);
    const remainingTransactionNumbers = remainingTransactions.map(transaction => transaction.transactionNumber);
    expect(remainingTransactionNumbers.includes(1)).toBeTruthy();
    expect(remainingTransactionNumbers.includes(2)).toBeTruthy();
    expect(remainingTransactionNumbers.includes(3)).toBeTruthy();
    expect(remainingTransactionNumbers.includes(4)).toBeTruthy();
    expect(remainingTransactionNumbers.includes(5)).toBeTruthy();
  });

  it('should be able to delete all transactions.', async () => {
    const transactionCount = 10;
    await generateAndStoreTransactions(transactionStore, transactionCount);

    // Deleting all transactions by not passing any argument.
    await transactionStore.removeTransactionsLaterThan();

    const remainingTransactions = await transactionStore.getTransactions();
    expect(remainingTransactions.length).toEqual(0);
  });

  it('should default the database name as `sidetree` if not explicitly overriden.', async () => {
    const transactionStore = new MongoDbTransactionStore(config.mongoDbConnectionString);
    expect(transactionStore.databaseName).toEqual(MongoDbTransactionStore.defaultDatabaseName);
  });
});

import MongoDbTransactionStore from '../lib/MongoDbTransactionStore';
import Transaction from '../lib/Transaction';
import { IConfig } from '../lib/Config';
import { MongoClient } from 'mongodb';
import { TransactionStore } from '../lib/TransactionStore';

/**
 * Test if a MongoDB service is running at the specified url.
 */
async function isMongoServiceAvailable (serverUrl: string): Promise<boolean> {
  try {
    const client = await MongoClient.connect(serverUrl);
    await client.close();
  } catch (error) {
    console.log('Mongoclient connect error: ' + error);
    return false;
  }
  return true;
}

/**
 * Creates a MongoDbTransactionStore and initializes it.
 */
async function createTransactionStore (transactionStoreUri: string, databaseName: string): Promise<MongoDbTransactionStore> {
  const transactionStore = new MongoDbTransactionStore(transactionStoreUri, databaseName, 1);
  await transactionStore.initialize();
  return transactionStore;
}

/**
 * Generates transactions where all the properties are initialized to the 1-based index of the transaction.
 * e.g. First transaction will have all properties assigned as 1 or '1';
 * @param transactionStore The transaction store to store the generated transactions.
 * @param count Number of transactions to generate and store.
 */
async function generateAndStoreTransactions (transactionStore: TransactionStore, count: number): Promise<Transaction[]> {
  const transactions: Transaction[] = [];
  for (let i = 1; i <= count; i++) {
    const transaction: Transaction = {
      anchorFileHash: i.toString(),
      transactionNumber: i,
      transactionTime: i,
      transactionTimeHash: i.toString()
    };

    await transactionStore.addProcessedTransaction(transaction);

    transactions.push(transaction);
  }

  return transactions;
}

describe('MongoDbTransactionStore', async () => {
  const config: IConfig = require('../json/config-test.json');
  const databaseName = 'sidetree-test';

  let transactionStore: MongoDbTransactionStore;

  beforeEach(async () => {
    if (!await isMongoServiceAvailable(config.mongoDbConnectionString)) {
      pending('MongoDB service not available');
    }

    transactionStore = await createTransactionStore(config.mongoDbConnectionString, databaseName);
    await transactionStore.emptyCollections();
  });

  it('should create collections needed on initialization if they do not exist.', async () => {
    console.info(`Deleting collections...`);
    const client = await MongoClient.connect(config.mongoDbConnectionString);
    const db = client.db(databaseName);
    await db.dropCollection(MongoDbTransactionStore.transactionCollectionName);
    await db.dropCollection(MongoDbTransactionStore.unresolvableTransactionCollectionName);

    console.info(`Verify collections no longer exist.`);
    let collections = await db.collections();
    let collectionNames = collections.map(collection => collection.collectionName);
    expect(collectionNames.includes(MongoDbTransactionStore.transactionCollectionName)).toBeFalsy();
    expect(collectionNames.includes(MongoDbTransactionStore.unresolvableTransactionCollectionName)).toBeFalsy();

    console.info(`Trigger initialization.`);
    await transactionStore.initialize();

    console.info(`Verify collection exists now.`);
    collections = await db.collections();
    collectionNames = collections.map(collection => collection.collectionName);
    expect(collectionNames.includes(MongoDbTransactionStore.transactionCollectionName)).toBeTruthy();
    expect(collectionNames.includes(MongoDbTransactionStore.unresolvableTransactionCollectionName)).toBeTruthy();
  });

  it('should not store duplicated transactions.', async () => {
    const transactionCount = 3;
    await generateAndStoreTransactions(transactionStore, transactionCount);

    let transactions = await transactionStore.getProcessedTransactions();
    expect(transactions.length).toEqual(transactionCount);

    // Attempt to reinsert the same transaction with the same property values.
    await generateAndStoreTransactions(transactionStore, transactionCount);

    transactions = await transactionStore.getProcessedTransactions();
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

  it('should record and update unresolvable transactions', async () => {
    const transactionCount = 10;
    const transactions = await generateAndStoreTransactions(transactionStore, transactionCount);

    // Simulate the first 3 transactions as unresolvable.
    await transactionStore.recordUnresolvableTransactionFetchAttempt(transactions[0]);
    await transactionStore.recordUnresolvableTransactionFetchAttempt(transactions[1]);
    await transactionStore.recordUnresolvableTransactionFetchAttempt(transactions[2]);
    let unresolvableTransactions = await transactionStore.getUnresolvableTransactions();
    expect(unresolvableTransactions.length).toEqual(3);

    // Simulate the first transaction as failing retry attempt again.
    await transactionStore.recordUnresolvableTransactionFetchAttempt(transactions[0]);
    unresolvableTransactions = await transactionStore.getUnresolvableTransactions();
    expect(unresolvableTransactions.length).toEqual(3);
    expect(unresolvableTransactions[0].retryAttempts).toEqual(1);
  });

  it('should be able to remove an existing unresolvable transactions', async () => {
    const transactionCount = 10;
    const transactions = await generateAndStoreTransactions(transactionStore, transactionCount);

    // Simulate the first 3 transactions as unresolvable.
    await transactionStore.recordUnresolvableTransactionFetchAttempt(transactions[0]);
    await transactionStore.recordUnresolvableTransactionFetchAttempt(transactions[1]);
    await transactionStore.recordUnresolvableTransactionFetchAttempt(transactions[2]);
    let unresolvableTransactions = await transactionStore.getUnresolvableTransactions();
    expect(unresolvableTransactions.length).toEqual(3);

    // Remove the 2nd unresolvable transaction.
    await transactionStore.removeUnresolvableTransaction(transactions[1]);
    unresolvableTransactions = await transactionStore.getUnresolvableTransactions();
    expect(unresolvableTransactions.length).toEqual(2);
    // Expect that we can no longer find the originally 2nd unresolvable transaction.
    const unresolvableTransactionNumbers = unresolvableTransactions.map(transaction => transaction.transactionNumber);
    expect(unresolvableTransactionNumbers.includes(2)).toBeFalsy();
  });

  it('should be able to limit the number of unresolvable transactions returned for processing retry.', async () => {
    const transactionCount = 10;
    const transactions = await generateAndStoreTransactions(transactionStore, transactionCount);

    // Simulate the first 3 transactions as unresolvable.
    await transactionStore.recordUnresolvableTransactionFetchAttempt(transactions[0]);
    await transactionStore.recordUnresolvableTransactionFetchAttempt(transactions[1]);
    await transactionStore.recordUnresolvableTransactionFetchAttempt(transactions[2]);
    let unresolvableTransactions = await transactionStore.getUnresolvableTransactions();
    expect(unresolvableTransactions.length).toEqual(3);

    // Get only 2 unresolvable transactions due for retry.
    const maxReturnCount = 2;
    let unresolvableTransactionsDueForRetry = await transactionStore.getUnresolvableTransactionsDueForRetry(maxReturnCount);
    expect(unresolvableTransactionsDueForRetry.length).toEqual(2);
    // Simulate successful resolution of the 2 returend transactions and removing them from the store.
    for (let transaction of unresolvableTransactionsDueForRetry) {
      await transactionStore.removeUnresolvableTransaction(transaction);
    }
    unresolvableTransactions = await transactionStore.getUnresolvableTransactions();
    expect(unresolvableTransactions.length).toEqual(1);

    // Get remaining 1 unresolvable transaction due for retry.
    unresolvableTransactionsDueForRetry = await transactionStore.getUnresolvableTransactionsDueForRetry(maxReturnCount);
    expect(unresolvableTransactionsDueForRetry.length).toEqual(1);
    // Simulate successful resolution of the 1 returend transaction and removing it from the store.
    for (let transaction of unresolvableTransactionsDueForRetry) {
      await transactionStore.removeUnresolvableTransaction(transaction);
    }
    unresolvableTransactions = await transactionStore.getUnresolvableTransactions();
    expect(unresolvableTransactions.length).toEqual(0);
  });

  it('should be able to delete transactions greater than a given transaction time.', async () => {
    const transactionCount = 10;
    const transactions = await generateAndStoreTransactions(transactionStore, transactionCount);

    // Simulate the transactions 4, 5, 6 as unresolvable.
    await transactionStore.recordUnresolvableTransactionFetchAttempt(transactions[3]);
    await transactionStore.recordUnresolvableTransactionFetchAttempt(transactions[4]);
    await transactionStore.recordUnresolvableTransactionFetchAttempt(transactions[5]);

    // Deleting all transactions that are later than transaction number 5.
    await transactionStore.removeTransactionsLaterThan(5);

    // Expecting only transaction 4 & 5 are unresolvable transactions.
    const unresolvableTransactions = await transactionStore.getUnresolvableTransactions();
    expect(unresolvableTransactions.length).toEqual(2);
    const unresolvableTransactionNumbers = unresolvableTransactions.map(transaction => transaction.transactionNumber);
    expect(unresolvableTransactionNumbers.includes(4)).toBeTruthy();
    expect(unresolvableTransactionNumbers.includes(5)).toBeTruthy();

    // Expecting only transaction 1 & 2 are remaining transactions.
    const remainingTransactions = await transactionStore.getProcessedTransactions();
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
    const transactions = await generateAndStoreTransactions(transactionStore, transactionCount);

    // Simulate the transactions 4, 5, 6 as unresolvable.
    await transactionStore.recordUnresolvableTransactionFetchAttempt(transactions[3]);
    await transactionStore.recordUnresolvableTransactionFetchAttempt(transactions[4]);
    await transactionStore.recordUnresolvableTransactionFetchAttempt(transactions[5]);

    // Deleting all transactions by not passing any argument.
    await transactionStore.removeTransactionsLaterThan();

    const unresolvableTransactions = await transactionStore.getUnresolvableTransactions();
    expect(unresolvableTransactions.length).toEqual(0);

    const remainingTransactions = await transactionStore.getProcessedTransactions();
    expect(remainingTransactions.length).toEqual(0);
  });

  it('should default the database name as `sidetree` if not explicitly overriden.', async () => {
    const transactionStore = new MongoDbTransactionStore(config.mongoDbConnectionString);
    expect(transactionStore.databaseName).toEqual(MongoDbTransactionStore.defaultDatabaseName);
  });
});

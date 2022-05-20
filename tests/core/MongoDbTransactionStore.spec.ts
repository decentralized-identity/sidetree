import Config from '../../lib/core/models/Config';
import ITransactionStore from '../../lib/core/interfaces/ITransactionStore';
import { MongoClient } from 'mongodb';
import MongoDb from '../common/MongoDb';
import MongoDbTransactionStore from '../../lib/common/MongoDbTransactionStore';
import TransactionModel from '../../lib/common/models/TransactionModel';

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
      transactionTimeHash: i.toString(),
      transactionFeePaid: 1,
      normalizedTransactionFee: 1,
      writer: 'writer'
    };

    await transactionStore.addTransaction(transaction);

    transactions.push(transaction);
  }

  return transactions;
}

describe('MongoDbTransactionStore', async () => {
  const config: Config = require('../json/config-test.json');
  const databaseName = 'sidetree-test';

  let transactionStore: MongoDbTransactionStore;
  beforeAll(async () => {
    await MongoDb.createInmemoryDb(config);
    transactionStore = await createTransactionStore(config.mongoDbConnectionString, databaseName);
  });

  beforeEach(async () => {
    await transactionStore.clearCollection();
  });

  it('should throw error if addTransaction throws a non 11000 error', async () => {
    spyOn(transactionStore['collection'] as any, 'insertOne').and.throwError('Expected test error');
    try {
      await transactionStore.addTransaction({
        transactionNumber: 1,
        transactionTime: 1,
        transactionFeePaid: 1,
        transactionTimeHash: 'hash',
        anchorString: 'anchorString',
        writer: 'writer'
      });
      fail('expected to throw but did not');
    } catch (error) {
      expect(error).toEqual(new Error('Expected test error'));
    }
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

  it('should be able to fetch the count of transactions.', async () => {
    const transactionCount = 3;
    await generateAndStoreTransactions(transactionStore, transactionCount);

    const actualTransactionCount = await transactionStore.getTransactionsCount();
    expect(actualTransactionCount).toEqual(transactionCount);
  });

  it('should be able to fetch transaction by transaction number.', async () => {
    const transactionCount = 3;
    await generateAndStoreTransactions(transactionStore, transactionCount);

    const transaction = await transactionStore.getTransaction(2);
    expect(transaction!.transactionTime).toEqual(2);
  });

  it('should return undefined if unable to find transaction of the given transaction number.', async () => {
    const transactionCount = 3;
    await generateAndStoreTransactions(transactionStore, transactionCount);

    const transaction = await transactionStore.getTransaction(4);
    expect(transaction).toBeUndefined();
  });

  it('should be able to fetch transactions later than a given transaction number.', async () => {
    const transactionCount = 3;
    await generateAndStoreTransactions(transactionStore, transactionCount);

    const transactions = await transactionStore.getTransactionsLaterThan(1, 100);
    expect(transactions.length).toEqual(2);
    expect(transactions[0].transactionNumber).toEqual(2);
    expect(transactions[1].transactionNumber).toEqual(3);
  });

  it('should return [] if error is thrown when fetching transactions later than a given transaction number', async () => {
    const transactionCount = 3;
    await generateAndStoreTransactions(transactionStore, transactionCount);

    spyOn(transactionStore['collection'] as any, 'find').and.throwError('expected test error');
    const transactions = await transactionStore.getTransactionsLaterThan(1, 100);
    expect(transactions.length).toEqual(0);
  });

  it('should fetch transactions from the start if transaction number is not given.', async () => {
    const transactionCount = 3;
    await generateAndStoreTransactions(transactionStore, transactionCount);

    const transactions = await transactionStore.getTransactionsLaterThan(undefined, undefined);
    expect(transactions.length).toEqual(3);
    expect(transactions[0].transactionNumber).toEqual(1);
    expect(transactions[1].transactionNumber).toEqual(2);
    expect(transactions[2].transactionNumber).toEqual(3);
  });

  it('should limit the transactions fetched if a limit is defined.', async () => {
    const transactionCount = 3;
    await generateAndStoreTransactions(transactionStore, transactionCount);

    const transactions = await transactionStore.getTransactionsLaterThan(undefined, 2);
    expect(transactions.length).toEqual(2);
    expect(transactions[0].transactionNumber).toEqual(1);
    expect(transactions[1].transactionNumber).toEqual(2);
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

  it('should be able to delete transactions by transaction time hash', async () => {
    const transactions = await generateAndStoreTransactions(transactionStore, 10);
    const hashToDelete = transactions[0].transactionTimeHash;

    await transactionStore.removeTransactionByTransactionTimeHash(hashToDelete);

    const remainingTransactions = await transactionStore.getTransactions();
    expect(remainingTransactions.length).toEqual(9);
    for (const transaction of remainingTransactions) {
      expect(transaction.transactionTimeHash !== hashToDelete).toBeTruthy();
    }
  });

  it('should be able to delete all transactions.', async () => {
    const transactionCount = 10;
    await generateAndStoreTransactions(transactionStore, transactionCount);

    // Deleting all transactions by not passing any argument.
    await transactionStore.removeTransactionsLaterThan();

    const remainingTransactions = await transactionStore.getTransactions();
    expect(remainingTransactions.length).toEqual(0);
  });

  it('should fetch transactions by 1 transactionTime when end time is the same as begin time', async () => {
    const transaction1: TransactionModel = {
      anchorString: 'string1',
      transactionNumber: 1,
      transactionTime: 1,
      transactionTimeHash: '1',
      transactionFeePaid: 1,
      normalizedTransactionFee: 1,
      writer: 'writer1'
    };

    const transaction2: TransactionModel = {
      anchorString: 'string2',
      transactionNumber: 2,
      transactionTime: 2,
      transactionTimeHash: '2',
      transactionFeePaid: 1,
      normalizedTransactionFee: 1,
      writer: 'writer2'
    };

    const transaction3: TransactionModel = {
      anchorString: 'string3',
      transactionNumber: 3,
      transactionTime: 2,
      transactionTimeHash: '2',
      transactionFeePaid: 1,
      normalizedTransactionFee: 1,
      writer: 'writer3'
    };

    await transactionStore.addTransaction(transaction1);
    await transactionStore.addTransaction(transaction2);
    await transactionStore.addTransaction(transaction3);

    const result = await transactionStore.getTransactionsStartingFrom(2, 2);
    expect(result.length).toEqual(2);
    expect(result[0].transactionNumber).toEqual(2);
    expect(result[1].transactionNumber).toEqual(3);
  });

  it('should fetch transactions going forward in time when end time is greater than begin time', async () => {
    const transaction1: TransactionModel = {
      anchorString: 'string1',
      transactionNumber: 1,
      transactionTime: 1,
      transactionTimeHash: '1',
      transactionFeePaid: 1,
      normalizedTransactionFee: 1,
      writer: 'writer1'
    };

    const transaction2: TransactionModel = {
      anchorString: 'string2',
      transactionNumber: 2,
      transactionTime: 2,
      transactionTimeHash: '2',
      transactionFeePaid: 1,
      normalizedTransactionFee: 1,
      writer: 'writer2'
    };

    const transaction3: TransactionModel = {
      anchorString: 'string3',
      transactionNumber: 3,
      transactionTime: 3,
      transactionTimeHash: '3',
      transactionFeePaid: 1,
      normalizedTransactionFee: 1,
      writer: 'writer3'
    };

    await transactionStore.addTransaction(transaction1);
    await transactionStore.addTransaction(transaction2);
    await transactionStore.addTransaction(transaction3);

    const result = await transactionStore.getTransactionsStartingFrom(1, 3);
    expect(result.length).toEqual(2);
    expect(result[0].transactionNumber).toEqual(1);
    expect(result[1].transactionNumber).toEqual(2);
  });

  it('should fetch no transactions if begin is greater than end', async () => {
    const transaction1: TransactionModel = {
      anchorString: 'string1',
      transactionNumber: 1,
      transactionTime: 1,
      transactionTimeHash: '1',
      transactionFeePaid: 1,
      normalizedTransactionFee: 1,
      writer: 'writer1'
    };

    const transaction2: TransactionModel = {
      anchorString: 'string2',
      transactionNumber: 2,
      transactionTime: 2,
      transactionTimeHash: '2',
      transactionFeePaid: 1,
      normalizedTransactionFee: 1,
      writer: 'writer2'
    };

    const transaction3: TransactionModel = {
      anchorString: 'string3',
      transactionNumber: 3,
      transactionTime: 3,
      transactionTimeHash: '3',
      transactionFeePaid: 1,
      normalizedTransactionFee: 1,
      writer: 'writer3'
    };

    await transactionStore.addTransaction(transaction1);
    await transactionStore.addTransaction(transaction2);
    await transactionStore.addTransaction(transaction3);

    const result = await transactionStore.getTransactionsStartingFrom(3, 1);
    expect(result.length).toEqual(0);
  });
});

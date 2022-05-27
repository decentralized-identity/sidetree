
import Config from '../../../lib/core/models/Config';
import { MongoClient } from 'mongodb';
import MongoDb from '../../common/MongoDb';
import MongoDbLockTransactionStore from '../../../lib/bitcoin/lock/MongoDbLockTransactionStore';
import SavedLockModel from '../../../lib/bitcoin/models/SavedLockedModel';
import SavedLockType from '../../../lib/bitcoin/enums/SavedLockType';

async function createLockStore (transactionStoreUri: string, databaseName: string): Promise<MongoDbLockTransactionStore> {
  const lockStore = new MongoDbLockTransactionStore(transactionStoreUri, databaseName);
  await lockStore.initialize();
  return lockStore;
}

async function generateAndStoreLocks (lockStore: MongoDbLockTransactionStore, count: number): Promise<SavedLockModel[]> {
  const locks: SavedLockModel[] = [];

  for (let i = 1; i <= count; i++) {
    const lock: SavedLockModel = {
      transactionId: i.toString(),
      desiredLockAmountInSatoshis: i * 1000,
      rawTransaction: `serialized txn - ${i}`,
      redeemScriptAsHex: `redeem-script-${i}`,
      type: getLockTypeFromIndex(i),
      createTimestamp: (Date.now() + i * 1000)
    };

    await lockStore.addLock(lock);

    locks.push(lock);
  }

  return locks;
}

function getLockTypeFromIndex (i: number): SavedLockType {
  return (i % 3 === 0) ? SavedLockType.Create
    : (i % 3 === 1) ? SavedLockType.Relock
      : SavedLockType.ReturnToWallet;
}

describe('MongoDbLockTransactionStore', async () => {
  const config: Config = require('../../json/config-test.json');
  const databaseName = 'sidetree-test';

  let lockStore: MongoDbLockTransactionStore;

  const originalDefaultTestTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;

  beforeAll(async () => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 20000; // These asynchronous tests can take a bit longer than normal.

    await MongoDb.createInmemoryDb(config);
    lockStore = await createLockStore(config.mongoDbConnectionString, databaseName);
  });

  afterAll(() => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = originalDefaultTestTimeout;
  });

  beforeEach(async () => {
    await lockStore.clearCollection();
  });

  it('should create collections needed on initialization if they do not exist.', async () => {
    console.info(`Deleting collections...`);
    const client = await MongoClient.connect(config.mongoDbConnectionString);
    const db = client.db(databaseName);
    await db.dropCollection(MongoDbLockTransactionStore.lockCollectionName);

    console.info(`Verify collections no longer exist.`);
    let collections = await db.collections();
    let collectionNames = collections.map(collection => collection.collectionName);
    expect(collectionNames.includes(MongoDbLockTransactionStore.lockCollectionName)).toBeFalsy();

    console.info(`Trigger initialization.`);
    await lockStore.initialize();

    console.info(`Verify collection exists now.`);
    collections = await db.collections();
    collectionNames = collections.map(collection => collection.collectionName);
    expect(collectionNames.includes(MongoDbLockTransactionStore.lockCollectionName)).toBeTruthy();
  });

  it('should get the latest lock.', async () => {
    const mockLocks = await generateAndStoreLocks(lockStore, 10);
    const expectedLastLock = mockLocks[mockLocks.length - 1];

    const lastLock = await lockStore.getLastLock();
    expect(lastLock).toBeDefined();
    delete (lastLock! as any)['_id']; // _id is added by mongo; remove for equality check
    expect(lastLock!).toEqual(expectedLastLock);
  });

  it('should return undefined if there is no locks saved.', async () => {
    const lastLock = await lockStore.getLastLock();
    expect(lastLock).not.toBeDefined();
  });
});


import BitcoinLockModel from '../../lib/bitcoin/models/BitcoinLockModel';
import BitcoinLockType from '../../lib/bitcoin/enums/BitcoinLockType';
import Config from '../../lib/core/models/Config';
import MongoDb from '../common/MongoDb';
import MongoDbLockStore from '../../lib/bitcoin/MongoDbLockStore';
import { MongoClient } from 'mongodb';

async function createLockStore (transactionStoreUri: string, databaseName: string): Promise<MongoDbLockStore> {
  const lockStore = new MongoDbLockStore(transactionStoreUri, databaseName);
  await lockStore.initialize();
  return lockStore;
}

async function generateAndStoreLocks (lockStore: MongoDbLockStore, count: number): Promise<BitcoinLockModel[]> {
  const locks: BitcoinLockModel[] = [];

  for (let i = 1; i <= count; i++) {
    const lock: BitcoinLockModel = {
      transactionId: i.toString(),
      redeemScript: `redeem-script-${i}`,
      type: getLockTypeFromIndex(i),
      createTimestamp: (Date.now() + i * 1000)
    };

    await lockStore.addLock(lock);

    locks.push(lock);
  }

  return locks;
}

function getLockTypeFromIndex (i: number): BitcoinLockType {
  return (i % 3 === 0) ? BitcoinLockType.Create :
         (i % 3 === 1) ? BitcoinLockType.Relock :
         BitcoinLockType.ReturnToWallet;
}

describe('MongoDbLockStore', async () => {
  const config: Config = require('../json/config-test.json');
  const databaseName = 'sidetree-test';

  let mongoServiceAvailable: boolean | undefined;
  let lockStore: MongoDbLockStore;

  const originalDefaultTestTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;

  beforeAll(async () => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 20000; // These asynchronous tests can take a bit longer than normal.

    mongoServiceAvailable = await MongoDb.isServerAvailable(config.mongoDbConnectionString);

    if (mongoServiceAvailable) {
      lockStore = await createLockStore(config.mongoDbConnectionString, databaseName);
    }
  });

  afterAll(() => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = originalDefaultTestTimeout;
  });

  beforeEach(async () => {
    if (!mongoServiceAvailable) {
      pending('MongoDB service not available');
    }

    await lockStore.clearCollection();
  });

  it('should create collections needed on initialization if they do not exist.', async () => {
    console.info(`Deleting collections...`);
    const client = await MongoClient.connect(config.mongoDbConnectionString);
    const db = client.db(databaseName);
    await db.dropCollection(MongoDbLockStore.lockCollectionName);

    console.info(`Verify collections no longer exist.`);
    let collections = await db.collections();
    let collectionNames = collections.map(collection => collection.collectionName);
    expect(collectionNames.includes(MongoDbLockStore.lockCollectionName)).toBeFalsy();

    console.info(`Trigger initialization.`);
    await lockStore.initialize();

    console.info(`Verify collection exists now.`);
    collections = await db.collections();
    collectionNames = collections.map(collection => collection.collectionName);
    expect(collectionNames.includes(MongoDbLockStore.lockCollectionName)).toBeTruthy();
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

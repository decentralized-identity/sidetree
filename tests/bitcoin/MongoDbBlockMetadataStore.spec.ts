import BlockMetadata from '../../lib/bitcoin/models/BlockMetadata';
import Config from '../../lib/core/models/Config';
import MongoDb from '../common/MongoDb';
import MongoDbBlockMetadataStore from '../../lib/bitcoin/MongoDbBlockMetadataStore';
import { MongoClient } from 'mongodb';

/**
 * Creates a MongoDbBlockMetadataStore and initializes it.
 */
async function createBlockMetadataStore (storeUri: string, databaseName: string): Promise<MongoDbBlockMetadataStore> {
  const store = new MongoDbBlockMetadataStore(storeUri, databaseName);
  await store.initialize();
  return store;
}

describe('MongoDbBlockMetadataStore', async () => {
  const config: Config = require('../json/config-test.json');
  const databaseName = 'sidetree-test';

  let mongoServiceAvailable = false;
  let blockMetadataStore: MongoDbBlockMetadataStore;
  beforeAll(async () => {
    mongoServiceAvailable = await MongoDb.isServerAvailable(config.mongoDbConnectionString);
    if (mongoServiceAvailable) {
      blockMetadataStore = await createBlockMetadataStore(config.mongoDbConnectionString, databaseName);
    }
  });

  beforeEach(async () => {
    if (!mongoServiceAvailable) {
      pending('MongoDB service not available');
    }

    await blockMetadataStore.clearStore();
  });

  it('should default the database name if not explicitly overriden.', async () => {
    const store = new MongoDbBlockMetadataStore(config.mongoDbConnectionString);
    expect(store.databaseName).toEqual(MongoDbBlockMetadataStore.defaultDatabaseName);
  });

  it('should put and get metadata of blocks correctly.', async () => {
    const block1: BlockMetadata = { hash: '1', height: 1, previousHash: '1', totalFee: 1, transactionCount: 1 };
    const block2: BlockMetadata = { hash: '2', height: 2, previousHash: '2', totalFee: 2, transactionCount: 2 };
    const block3: BlockMetadata = { hash: '3', height: 3, previousHash: '3', totalFee: 3, transactionCount: 3 };

    await blockMetadataStore.addBlockMetadata([block2, block3, block1]); // Intentionally mixed the order.

    let actualBlocks = await blockMetadataStore.getBlockMetadata(1, 4); // Test fetching all.
    expect(actualBlocks.length).toEqual(3);
    expect(actualBlocks[0].height).toEqual(1);
    expect(actualBlocks[1].height).toEqual(2);
    expect(actualBlocks[2].height).toEqual(3);

    actualBlocks = await blockMetadataStore.getBlockMetadata(2, 3); // Test fetching sub range.
    expect(actualBlocks.length).toEqual(1);
    expect(actualBlocks[0].height).toEqual(2);
  });

  describe('initialize()', async () => {
    it('should create collection on initialization if it does not exist.', async () => {
      // Deleting collections to setup this test.
      const client = await MongoClient.connect(config.mongoDbConnectionString);
      const db = client.db(databaseName);
      await db.dropCollection(MongoDbBlockMetadataStore.collectionName);

      // Make sure no collection exists before we start the test.
      let collections = await db.collections();
      let collectionNames = collections.map(collection => collection.collectionName);
      expect(collectionNames.includes(MongoDbBlockMetadataStore.collectionName)).toBeFalsy();

      await blockMetadataStore.initialize();

      collections = await db.collections();
      collectionNames = collections.map(collection => collection.collectionName);
      expect(collectionNames.includes(MongoDbBlockMetadataStore.collectionName)).toBeTruthy();
    });
  });

  describe('addBlockMetadata()', async () => {
    it('should be idempotent: ie. should not throw if data with the same height is added multiple times.', async () => {
      const block1: BlockMetadata = { hash: '1', height: 1, previousHash: '1', totalFee: 1, transactionCount: 1 };
      const block2: BlockMetadata = { hash: '2', height: 2, previousHash: '2', totalFee: 2, transactionCount: 2 };

      await blockMetadataStore.addBlockMetadata([block2, block1]); // Intentionally mixed the order.
      await blockMetadataStore.addBlockMetadata([block1, block2]); // Adding the same data again.

      let actualBlocks = await blockMetadataStore.getBlockMetadata(1, 4); // Test fetching all.
      expect(actualBlocks.length).toEqual(2);
      expect(actualBlocks[0].height).toEqual(1);
      expect(actualBlocks[1].height).toEqual(2);
    });

    it('should be idempotent: ie. should only throw if error code is not 11000.', async () => {
      // Return a fake bulk operation object that throws error up on `execute()`.
      spyOn((blockMetadataStore as any).collection, 'initializeOrderedBulkOp').and.callFake(
        () => {
          return {
            insert: () => { },
            execute: () => {
              const error = new Error('any message'); // Any error that is not 'BulkWriteError 11000'.
              throw error;
            }
          }
        }
      );

      try {
        await blockMetadataStore.addBlockMetadata([]);
      } catch (error) {
        // Expect above mocked error to be thrown.
        expect(error.message).toEqual('any message');
        return;
      }

      fail('Expecting error to be thrown but did not occur.');
    });
  });
});

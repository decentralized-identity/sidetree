import BlockMetadata from '../../lib/bitcoin/models/BlockMetadata';
import BlockMetadataGenerator from '../generators/BlockMetadataGenerator';
import Config from '../../lib/core/models/Config';
import { MongoClient } from 'mongodb';
import MongoDb from '../common/MongoDb';
import MongoDbBlockMetadataStore from '../../lib/bitcoin/MongoDbBlockMetadataStore';

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

  let blockMetadataStore: MongoDbBlockMetadataStore;
  beforeAll(async () => {
    await MongoDb.createInmemoryDb(config);
    blockMetadataStore = await createBlockMetadataStore(config.mongoDbConnectionString, databaseName);
  });

  beforeEach(async () => {
    await blockMetadataStore.clearCollection();
  });

  it('should add and get metadata of blocks correctly.', async (done) => {
    const block1: BlockMetadata = { hash: '1', height: 1, previousHash: '1', totalFee: 1, transactionCount: 1, normalizedFee: 1 };
    const block2: BlockMetadata = { hash: '2', height: 2, previousHash: '2', totalFee: 2, transactionCount: 2, normalizedFee: 1 };
    const block3: BlockMetadata = { hash: '3', height: 3, previousHash: '3', totalFee: 3, transactionCount: 3, normalizedFee: 1 };

    await blockMetadataStore.add([block2, block3, block1]); // Intentionally mixed the order.

    let actualBlocks = await blockMetadataStore.get(1, 4); // Test fetching all.
    expect(actualBlocks.length).toEqual(3);
    expect(actualBlocks[0].height).toEqual(1);
    expect(actualBlocks[1].height).toEqual(2);
    expect(actualBlocks[2].height).toEqual(3);

    actualBlocks = await blockMetadataStore.get(2, 3); // Test fetching sub range.
    expect(actualBlocks.length).toEqual(1);
    expect(actualBlocks[0].height).toEqual(2);

    done();
  });

  describe('initialize()', async () => {
    it('should create collection on initialization if it does not exist.', async (done) => {
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

      done();
    });
  });

  describe('removeLaterThan()', async () => {
    it('should remove only data later than the specified height.', async (done) => {
      const block1: BlockMetadata = { hash: 'hash1', height: 1, previousHash: '1', totalFee: 1, transactionCount: 1, normalizedFee: 1 };
      const block2: BlockMetadata = { hash: 'hash2', height: 2, previousHash: '2', totalFee: 2, transactionCount: 2, normalizedFee: 1 };
      const block3: BlockMetadata = { hash: 'hash3', height: 3, previousHash: '3', totalFee: 3, transactionCount: 3, normalizedFee: 1 };

      await blockMetadataStore.add([block2, block3, block1]); // Intentionally mixed the order.
      await blockMetadataStore.removeLaterThan(block1.height);

      const blocks = await blockMetadataStore.get(1, 4);
      expect(blocks.length).toEqual(1);
      expect(blocks[0].hash).toEqual('hash1');
      done();
    });

    it('should remove all if no height is given', async (done) => {
      const blocks = BlockMetadataGenerator.generate(10); // NOTE: block heights will be 0 to 9.

      await blockMetadataStore.add(blocks);
      await blockMetadataStore.removeLaterThan();

      const returnedblocks = await blockMetadataStore.get(0, 10);
      expect(returnedblocks.length).toEqual(0);
      done();
    });
  });

  describe('getLast()', async () => {
    it('should get block metadata with the largest height.', async (done) => {
      const block1: BlockMetadata = { hash: '1', height: 1, previousHash: '1', totalFee: 1, transactionCount: 1, normalizedFee: 1 };
      const block2: BlockMetadata = { hash: '2', height: 2, previousHash: '2', totalFee: 2, transactionCount: 2, normalizedFee: 1 };
      const block3: BlockMetadata = { hash: '3', height: 3, previousHash: '3', totalFee: 3, transactionCount: 3, normalizedFee: 1 };

      await blockMetadataStore.add([block2, block3, block1]); // Intentionally mixed the order.

      const lastBlock = await blockMetadataStore.getLast();
      expect(lastBlock!.height).toEqual(block3.height);
      done();
    });

    it('should return `undefined` if block metadata store is emtpy.', async (done) => {
      const lastBlock = await blockMetadataStore.getLast();
      expect(lastBlock).toBeUndefined();
      done();
    });
  });

  describe('getFirst()', async () => {
    it('should get block metadata with the largest height.', async (done) => {
      const block1: BlockMetadata = { hash: '1', height: 1, previousHash: '1', totalFee: 1, transactionCount: 1, normalizedFee: 1 };
      const block2: BlockMetadata = { hash: '2', height: 2, previousHash: '2', totalFee: 2, transactionCount: 2, normalizedFee: 1 };
      const block3: BlockMetadata = { hash: '3', height: 3, previousHash: '3', totalFee: 3, transactionCount: 3, normalizedFee: 1 };

      await blockMetadataStore.add([block2, block3, block1]); // Intentionally mixed the order.

      const firstBlock = await (blockMetadataStore as any).getFirst();
      expect(firstBlock.height).toEqual(block1.height);
      done();
    });

    it('should return `undefined` if block metadata store is emtpy.', async (done) => {
      const firstBlock = await (blockMetadataStore as any).getFirst();
      expect(firstBlock).toBeUndefined();
      done();
    });
  });

  describe('lookBackExponentially()', async () => {
    it('should get block metadata with the largest height.', async (done) => {
      const blocks = BlockMetadataGenerator.generate(10); // NOTE: block heights will be 0 to 9.

      await blockMetadataStore.add(blocks);

      const expectedExponentiallySpacedBlocks = [blocks[9], blocks[8], blocks[7], blocks[5], blocks[1]];

      const actualExponentiallySpacedBlocks = await blockMetadataStore.lookBackExponentially();
      expect(actualExponentiallySpacedBlocks).toEqual(expectedExponentiallySpacedBlocks);
      done();
    });

    it('should return empty array if block metadata store is emtpy.', async (done) => {
      const actualExponentiallySpacedBlocks = await blockMetadataStore.lookBackExponentially();
      expect(actualExponentiallySpacedBlocks).toEqual([]);
      done();
    });
  });
});

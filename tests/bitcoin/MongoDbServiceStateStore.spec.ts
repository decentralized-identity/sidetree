import BitcoinServiceStateModel from '../../lib/bitcoin/models/BitcoinServiceStateModel';
import Config from '../../lib/core/models/Config';
import { MongoClient } from 'mongodb';
import MongoDb from '../common/MongoDb';
import MongoDbServiceStateStore from '../../lib/common/MongoDbServiceStateStore';

/**
 * Creates a MongoDbServiceStateStore and initializes it.
 */
async function createStore (storeUri: string, databaseName: string): Promise<MongoDbServiceStateStore<BitcoinServiceStateModel>> {
  const store = new MongoDbServiceStateStore<BitcoinServiceStateModel>(storeUri, databaseName);
  await store.initialize();
  return store;
}

describe('MongoDbServiceStateStore', async () => {

  const config: Config = require('../json/config-test.json');
  const databaseName = 'sidetree-test';

  let mongoServiceAvailable = false;
  let store: MongoDbServiceStateStore<BitcoinServiceStateModel>;

  beforeAll(async () => {
    mongoServiceAvailable = await MongoDb.isServerAvailable(config.mongoDbConnectionString);
    if (mongoServiceAvailable) {
      store = await createStore(config.mongoDbConnectionString, databaseName);
    }
  });

  beforeEach(async () => {
    if (!mongoServiceAvailable) {
      pending('MongoDB service not available');
    }

    await store.clearCollection();
  });

  it('should put and get service state correctly.', async (done) => {
    // Expect service state to be undefined before any state is added.
    let actualServiceState = await store.get();
    expect(actualServiceState).toBeUndefined();

    // Put then get an initial service state.
    const initialServiceState: BitcoinServiceStateModel = { serviceVersion: '1' };
    await store.put(initialServiceState);
    actualServiceState = await store.get();
    expect(actualServiceState).toEqual(initialServiceState);

    // Put then get another service state to test upsert.
    const newServiceState: BitcoinServiceStateModel = { serviceVersion: '2' };
    await store.put(newServiceState);
    actualServiceState = await store.get();
    expect(actualServiceState).toEqual(newServiceState);

    done();
  });

  describe('initialize()', async () => {
    it('should create collection on initialization if it does not exist.', async (done) => {
      // Deleting collections to setup this test.
      const client = await MongoClient.connect(config.mongoDbConnectionString);
      const db = client.db(databaseName);
      await db.dropCollection(MongoDbServiceStateStore.collectionName);

      // Make sure no collection exists before we start the test.
      let collections = await db.collections();
      let collectionNames = collections.map(collection => collection.collectionName);
      expect(collectionNames.includes(MongoDbServiceStateStore.collectionName)).toBeFalsy();

      // // NOTE: This test fails in cosmosDB when due to the speed in which db.collections() is called after initialize().
      // // Strangely enough, if an index is created using createIndex() override (such as MongoDBBlockMetadataStore),
      // // then the exactly same test will reliably pass as seen in MongoDBBlockMetadataStore.spec.ts
      await store.initialize();

      collections = await db.collections();
      collectionNames = collections.map(collection => collection.collectionName);
      expect(collectionNames.includes(MongoDbServiceStateStore.collectionName)).toBeTruthy();

      done();
    });
  });
});

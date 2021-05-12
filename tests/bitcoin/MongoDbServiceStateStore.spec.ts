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
    // Put then get an initial service state.
    const initialServiceState: BitcoinServiceStateModel = { serviceVersion: '1' };
    await store.put(initialServiceState);
    let actualServiceState = await store.get();
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
      const collections = await db.collections();
      const collectionNames = collections.map(collection => collection.collectionName);
      expect(collectionNames.includes(MongoDbServiceStateStore.collectionName)).toBeFalsy();

      // NOTE: In CosmosDB `db.createCollection()` call in `initialize()` does not make the collection "visible"
      // until a subsequent operation is called (such as `createIndex()` or inserting record) possibly due to lazy load.
      // hence in this test we insert a record and retrieve it again to prove that the collection is created.
      await store.initialize();
      await store.put({ serviceVersion: '1.1' });

      const serviceState = await store.get();
      expect(serviceState?.serviceVersion).toEqual('1.1');

      done();
    });
  });
});

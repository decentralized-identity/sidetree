import BitcoinServiceStateModel from '../../lib/bitcoin/models/BitcoinServiceStateModel';
import BlockMetadata from '../../lib/bitcoin/models/BlockMetadata';
import Config from '../../lib/core/models/Config';
import MongoDb from '../common/MongoDb';
import MongoDbServiceStateStore from '../../lib/bitcoin/MongoDbServiceStateStore';

/**
 * Creates a MongoDbServiceStateStore and initializes it.
 */
async function createStore (storeUri: string, databaseName: string): Promise<MongoDbServiceStateStore<BitcoinServiceStateModel>> {
  const store = new MongoDbServiceStateStore<BitcoinServiceStateModel>(storeUri, databaseName);
  await store.initialize();
  return store;
}

describe('MongoDbSeviceStateStore', async () => {
  const config: Config = require('../json/bitcoin-config-test.json');
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

    await store.clearStore();
  });

  it('should put and get service state correctly.', async () => {
    // Expect service state to be undefined before any state is added.
    let actualServiceState = await store.get();
    expect(actualServiceState).toBeUndefined();

    // Put then get an initial service state.
    const initialServiceState: BitcoinServiceStateModel = { serviceVersion: '1' };
    await store.put(initialServiceState);
    actualServiceState = await store.get();
    expect(actualServiceState).toEqual(initialServiceState);

    // Put then get another service state to test upsert.
    const lastProcessedBlock: BlockMetadata = { hash: '2', height: 2, previousHash: '2', totalFee: 2, transactionCount: 2 };
    const newServiceState: BitcoinServiceStateModel = { serviceVersion: '2', lastProcessedBlock };
    await store.put(newServiceState);
    actualServiceState = await store.get();
    expect(actualServiceState).toEqual(newServiceState);
  });
});

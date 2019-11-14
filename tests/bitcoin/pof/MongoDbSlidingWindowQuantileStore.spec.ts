import MongoDb from '../../common/MongoDb';
import MongoDbSlidingWindowQuantileStore from '../../../lib/bitcoin/pof/MongoDbSlidingWindowQuantileStore';

function checkArrayEqual (array1: number[], array2: number[]): boolean {
  if (array1.length !== array2.length) {
    return false;
  }

  for (let i = 0 ; i < array1.length ; ++i) {
    if (array1[i] !== array2[i]) {
      return false;
    }
  }

  return true;
}

describe('SlidingWindowQuantileMongoStore', async () => {
  const mongoDbConnectionString = 'mongodb://localhost:27017';
  const databaseName = 'sidetree-test';
  let mongoStore: MongoDbSlidingWindowQuantileStore;
  let mongoServiceAvailable = false;

  beforeAll(async () => {
    mongoServiceAvailable = await MongoDb.isServerAvailable(mongoDbConnectionString);
    if (mongoServiceAvailable) {
      mongoStore = new MongoDbSlidingWindowQuantileStore(mongoDbConnectionString, databaseName);
      await mongoStore.initialize();
    }
  });

  beforeEach(async () => {
    if (!mongoServiceAvailable) {
      pending('MongoDB service not available');
    }

    await mongoStore.clear();
  });

  it('should put and get quantile info', async () => {
    const quantileInfo = {
      groupId: 1,
      quantile: 0.5,
      groupFreqVector: [0, 10]
    };

    await mongoStore.put(quantileInfo);

    const quantileInfoRetrieved = await mongoStore.get(quantileInfo.groupId);
    expect(quantileInfoRetrieved).toBeDefined();
    expect(quantileInfoRetrieved!.groupId).toBe(quantileInfo.groupId);
    expect(quantileInfoRetrieved!.quantile).toBe(quantileInfo.quantile);
    expect(checkArrayEqual(quantileInfoRetrieved!.groupFreqVector, quantileInfo.groupFreqVector)).toBe(true);
  });

  it('should return correct first/last groupid', async () => {
    for (let groupId = 1 ; groupId <= 10 ; groupId++) {
      await mongoStore.put({
        groupId: groupId,
        quantile: 0.5,
        groupFreqVector: [0, 10]
      });
    }

    const firstGroupId = await mongoStore.getFirstGroupId();
    expect(firstGroupId).toBeDefined();
    expect(firstGroupId!).toBe(1);

    const lastGroupId = await mongoStore.getLastGroupId();
    expect(lastGroupId).toBeDefined();
    expect(lastGroupId).toBe(10);
  });
});

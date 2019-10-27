import MongoDb from '../common/MongoDb';
import { QuantileInfo, SlidingWindowQuantileMongoStore } from '../../lib/bitcoin/SlidingWindowQuantileMongoStore';

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
  let mongoStore: SlidingWindowQuantileMongoStore;
  let mongoServiceAvailable = false;

  beforeAll(async () => {
    mongoServiceAvailable = await MongoDb.isServerAvailable(mongoDbConnectionString);
    if (mongoServiceAvailable) {
      mongoStore = new SlidingWindowQuantileMongoStore(mongoDbConnectionString, databaseName);
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
    const quantileInfo: QuantileInfo = {
      batchId: 1,
      quantile: 0.5,
      batchFreqVector: [0, 10]
    };

    await mongoStore.put(quantileInfo);

    const quantileInfoRetrieved = await mongoStore.get(quantileInfo.batchId);
    expect(quantileInfoRetrieved).toBeDefined();
    expect(quantileInfoRetrieved!.batchId).toBe(quantileInfo.batchId);
    expect(quantileInfoRetrieved!.quantile).toBe(quantileInfo.quantile);
    expect(checkArrayEqual(quantileInfoRetrieved!.batchFreqVector, quantileInfo.batchFreqVector)).toBe(true);
  });

  it('should return correct first/last batchid', async () => {
    for (let batchId = 1 ; batchId <= 10 ; batchId++) {
      await mongoStore.put({
        batchId,
        quantile: 0.5,
        batchFreqVector: [0, 10]
      });
    }

    const firstBatchId = await mongoStore.getFirstBatchId();
    expect(firstBatchId).toBeDefined();
    expect(firstBatchId!).toBe(1);

    const lastBatchId = await mongoStore.getLastBatchId();
    expect(lastBatchId).toBeDefined();
    expect(lastBatchId).toBe(10);
  });
});

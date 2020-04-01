import MockSlidingWindowQuantileStore from '../../mocks/MockSlidingWindowQuantileStore';
import ProtocolParameters from '../../../lib/bitcoin/ProtocolParameters';
import QuantileInfo from '../../../lib/bitcoin/models/QuantileInfo';
import RunLengthTransformer from '../../../lib/bitcoin/fee/RunLengthTransformer';
import SlidingWindowQuantileStoreInitializer from '../../../lib/bitcoin/fee/SlidingWindowQuantileStoreInitializer';
import ValueApproximator from '../../../lib/bitcoin/fee/ValueApproximator';

describe('SlidingWindowQuantileStoreInitializer', () => {
  let quantileStoreInitializer: SlidingWindowQuantileStoreInitializer;

  beforeEach(() => {
    const slidingWindowQuantileStore = new MockSlidingWindowQuantileStore();
    quantileStoreInitializer = (SlidingWindowQuantileStoreInitializer as any).createInstance(12345, 25000, slidingWindowQuantileStore);
  });

  describe('initializeDatabaseIfEmpty', () => {
    it('should create and call the correct function', async (done) => {
      const createSpy = spyOn(SlidingWindowQuantileStoreInitializer as any, 'createInstance').and.returnValue(quantileStoreInitializer);
      const addSpy = spyOn(quantileStoreInitializer as any, 'addDataIfNecessary').and.returnValue(Promise.resolve(true));

      const genesisBlockInput = 98765;
      const quantileStoreInput = new MockSlidingWindowQuantileStore();
      const approximatorInput = new ValueApproximator(1.414, Number.MAX_VALUE);

      await SlidingWindowQuantileStoreInitializer.initializeDatabaseIfEmpty(genesisBlockInput, approximatorInput, quantileStoreInput);

      const expectedQuantile = approximatorInput.getNormalizedValue(25000);
      expect(createSpy).toHaveBeenCalledWith(genesisBlockInput, expectedQuantile, quantileStoreInput);
      expect(addSpy).toHaveBeenCalled();
      done();
    });
  });

  describe('createInstance', () => {
    it('should create the instance with the correct parameters', () => {
      const genesisBlockInput = 98765;
      const initialQuantileValueInput = 76543;
      const quantileStoreInput = new MockSlidingWindowQuantileStore();

      const actual = SlidingWindowQuantileStoreInitializer['createInstance'](genesisBlockInput, initialQuantileValueInput, quantileStoreInput);
      expect(actual['genesisBlockNumber']).toEqual(genesisBlockInput);
      expect(actual['groupSizeInBlocks']).toEqual(ProtocolParameters.groupSizeInBlocks);
      expect(actual['initialQuantileValue']).toEqual(initialQuantileValueInput);
      expect(actual['sampleSizePerGroup']).toEqual(ProtocolParameters.sampleSizePerGroup);
      expect(actual['mongoDbStore']).toEqual(quantileStoreInput);
      expect(actual['windowSizeInGroup']).toEqual(ProtocolParameters.windowSizeInGroups);
    });
  });

  describe('addDataIfNecessary', () => {
    it('should not add if the data insertion is not required', async (done) => {
      const insertSpy = spyOn(quantileStoreInitializer as any, 'insertValuesInDb');
      spyOn(quantileStoreInitializer as any, 'isDataInsertionRequired').and.returnValue(Promise.resolve(false));

      const actual = await quantileStoreInitializer['addDataIfNecessary']();
      expect(actual).toBeFalsy();
      expect(insertSpy).not.toHaveBeenCalled();
      done();
    });

    it('should call insert with the correct values', async (done) => {
      const insertSpy = spyOn(quantileStoreInitializer as any, 'insertValuesInDb').and.returnValue(Promise.resolve());
      spyOn(quantileStoreInitializer as any, 'isDataInsertionRequired').and.returnValue(Promise.resolve(true));

      const actual = await quantileStoreInitializer['addDataIfNecessary']();
      expect(actual).toBeTruthy();

      const expectedEndGroupId = Math.floor(quantileStoreInitializer['genesisBlockNumber'] / ProtocolParameters.groupSizeInBlocks) - 1;
      const expectedStartGroupId = expectedEndGroupId - ProtocolParameters.windowSizeInGroups - 2;
      expect(insertSpy).toHaveBeenCalledWith(expectedStartGroupId, expectedEndGroupId);
      done();
    });
  });

  describe('insertValuesInDb', () => {
    it('should insert the correct values in the DB.', async (done) => {
      const startGroupInput = 100;
      const endGroupInput = 150;

      const frequencyVector = new Array<number>(ProtocolParameters.sampleSizePerGroup);
      frequencyVector.fill(quantileStoreInitializer['initialQuantileValue']);

      const expectedFrequencyVector = RunLengthTransformer.encode(frequencyVector);

      const insertedGroupIds = new Set<number>();

      const putSpy = spyOn(quantileStoreInitializer['mongoDbStore'], 'put').and.callFake(async (input: QuantileInfo | undefined) => {

        expect(input).toBeDefined();
        expect(input!.quantile).toEqual(quantileStoreInitializer['initialQuantileValue']);
        expect(input!.groupFreqVector).toEqual(expectedFrequencyVector);

        insertedGroupIds.add(input!.groupId);
        return Promise.resolve();
      });

      await quantileStoreInitializer['insertValuesInDb'](startGroupInput, endGroupInput);

      const expectedNumberOfInserts = endGroupInput - startGroupInput + 1;

      expect(putSpy).toHaveBeenCalledTimes(expectedNumberOfInserts);
      expect(insertedGroupIds.size).toEqual(expectedNumberOfInserts);
      expect(insertedGroupIds.has(startGroupInput)).toBeTruthy();
      expect(insertedGroupIds.has(endGroupInput)).toBeTruthy();

      done();
    });
  });

  describe('isDataInsertionRequired', () => {
    it('should return true if the database is empty', async (done) => {
      spyOn(quantileStoreInitializer['mongoDbStore'], 'getFirstGroupId').and.returnValue(Promise.resolve(undefined));

      const actual = await quantileStoreInitializer['isDataInsertionRequired'](10, 20);
      expect(actual).toBeTruthy();
      done();
    });

    it('should return true and clear mongo db if the database has invalid first group', async (done) => {
      const startGroupInput = 123;
      const endGroupInput = 200;

      spyOn(quantileStoreInitializer['mongoDbStore'], 'getFirstGroupId').and.returnValue(Promise.resolve(startGroupInput - 1));
      spyOn(quantileStoreInitializer['mongoDbStore'], 'getLastGroupId').and.returnValue(Promise.resolve(endGroupInput + 1));

      const clearStoreSpy = spyOn(quantileStoreInitializer['mongoDbStore'], 'clear').and.returnValue(Promise.resolve());

      const actual = await quantileStoreInitializer['isDataInsertionRequired'](10, 20);
      expect(actual).toBeTruthy();
      expect(clearStoreSpy).toHaveBeenCalled();
      done();
    });

    it('should return true and clear mongo db if the database has invalid first group 2', async (done) => {
      const startGroupInput = 123;
      const endGroupInput = 200;

      spyOn(quantileStoreInitializer['mongoDbStore'], 'getFirstGroupId').and.returnValue(Promise.resolve(startGroupInput + 1));
      spyOn(quantileStoreInitializer['mongoDbStore'], 'getLastGroupId').and.returnValue(Promise.resolve(endGroupInput));

      const clearStoreSpy = spyOn(quantileStoreInitializer['mongoDbStore'], 'clear').and.returnValue(Promise.resolve());

      const actual = await quantileStoreInitializer['isDataInsertionRequired'](startGroupInput, endGroupInput);
      expect(actual).toBeTruthy();
      expect(clearStoreSpy).toHaveBeenCalled();
      done();
    });

    it('should return true and clear mongo db if the database has invalid last group', async (done) => {
      const startGroupInput = 123;
      const endGroupInput = 200;

      spyOn(quantileStoreInitializer['mongoDbStore'], 'getFirstGroupId').and.returnValue(Promise.resolve(startGroupInput));
      spyOn(quantileStoreInitializer['mongoDbStore'], 'getLastGroupId').and.returnValue(Promise.resolve(endGroupInput - 1));

      const clearStoreSpy = spyOn(quantileStoreInitializer['mongoDbStore'], 'clear').and.returnValue(Promise.resolve());

      const actual = await quantileStoreInitializer['isDataInsertionRequired'](startGroupInput, endGroupInput);
      expect(actual).toBeTruthy();
      expect(clearStoreSpy).toHaveBeenCalled();
      done();
    });

    it('should return false if the database has valid inputs', async (done) => {
      const startGroupInput = 123;
      const endGroupInput = 200;

      spyOn(quantileStoreInitializer['mongoDbStore'], 'getFirstGroupId').and.returnValue(Promise.resolve(startGroupInput));
      spyOn(quantileStoreInitializer['mongoDbStore'], 'getLastGroupId').and.returnValue(Promise.resolve(endGroupInput));

      const clearStoreSpy = spyOn(quantileStoreInitializer['mongoDbStore'], 'clear').and.returnValue(Promise.resolve());

      const actual = await quantileStoreInitializer['isDataInsertionRequired'](startGroupInput, endGroupInput);
      expect(actual).toBeFalsy();
      expect(clearStoreSpy).not.toHaveBeenCalled();
      done();
    });
  });
});

import MockSlidingWindowQuantileStore from '../../mocks/MockSlidingWindowQuantileStore';
import ProtocolParameters from '../../../lib/bitcoin/ProtocolParameters';
import QuantileInfo from '../../../lib/bitcoin/models/QuantileInfo';
import RunLengthTransformer from '../../../lib/bitcoin/fee/RunLengthTransformer';
import SlidingWindowQuantileStoreInitializer from '../../../lib/bitcoin/fee/SlidingWindowQuantileStoreInitializer';

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

      await SlidingWindowQuantileStoreInitializer.initializeDatabaseIfEmpty(genesisBlockInput, quantileStoreInput);

      expect(createSpy).toHaveBeenCalledWith(genesisBlockInput, 25000, quantileStoreInput);
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
    it('should not add if the database is not empty', async (done) => {
      const insertSpy = spyOn(quantileStoreInitializer as any, 'insertValuesInStore');
      spyOn(quantileStoreInitializer['mongoDbStore'], 'getFirstGroupId').and.returnValue(Promise.resolve(1234));

      const actual = await quantileStoreInitializer['addDataIfNecessary']();
      expect(actual).toBeFalsy();
      expect(insertSpy).not.toHaveBeenCalled();
      done();
    });

    it('should call insert with the correct values', async (done) => {
      const insertSpy = spyOn(quantileStoreInitializer as any, 'insertValuesInStore').and.returnValue(Promise.resolve());
      spyOn(quantileStoreInitializer['mongoDbStore'], 'getFirstGroupId').and.returnValue(Promise.resolve(undefined));

      const actual = await quantileStoreInitializer['addDataIfNecessary']();
      expect(actual).toBeTruthy();

      const expectedEndGroupId = Math.floor(quantileStoreInitializer['genesisBlockNumber'] / ProtocolParameters.groupSizeInBlocks) - 1;
      const expectedStartGroupId = expectedEndGroupId - ProtocolParameters.windowSizeInGroups - 2;
      expect(insertSpy).toHaveBeenCalledWith(expectedStartGroupId, expectedEndGroupId);
      done();
    });
  });

  describe('insertValuesInStore', () => {
    it('should insert the correct values in the DB.', async (done) => {
      const startGroupInput = 100;
      const endGroupInput = 150;

      let startGroupInserted = false;
      let endGroupInserted = false;

      const frequencyVector = new Array<number>(ProtocolParameters.sampleSizePerGroup);
      frequencyVector.fill(quantileStoreInitializer['initialQuantileValue']);

      const expectedFrequencyVector = RunLengthTransformer.encode(frequencyVector);

      const putSpy = spyOn(quantileStoreInitializer['mongoDbStore'], 'put').and.callFake(async (input: QuantileInfo | undefined) => {

        expect(input).toBeDefined();
        expect(input!.quantile).toEqual(quantileStoreInitializer['initialQuantileValue']);
        expect(input!.groupFreqVector).toEqual(expectedFrequencyVector);

        if (input!.groupId === startGroupInput) {
          startGroupInserted = true;
        }

        if (input!.groupId === endGroupInput) {
          endGroupInserted = true;
        }

        return Promise.resolve();
      });

      await quantileStoreInitializer['insertValuesInStore'](startGroupInput, endGroupInput);

      expect(putSpy).toHaveBeenCalledTimes(endGroupInput - startGroupInput + 1);
      expect(startGroupInserted).toBeTruthy();
      expect(endGroupInserted).toBeTruthy();

      done();
    });
  });
});

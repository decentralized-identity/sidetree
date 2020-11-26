import BlockMetadataWithoutNormalizedFee from '../../../lib/bitcoin/models/BlockMetadataWithoutNormalizedFee';
import IBlockMetadataStore from '../../../lib/bitcoin/interfaces/IBlockMetadataStore';
import MockBlockMetadataStore from '../../mocks/MockBlockMetadataStore';
import NormalizedFeeCalculator from '../../../lib/bitcoin/versions/latest/NormalizedFeeCalculator';

describe('NormalizedFeeCalculaor', () => {
  let normalizedFeeCalculator: NormalizedFeeCalculator;
  let mockMetadataStore: IBlockMetadataStore;

  beforeEach(() => {
    mockMetadataStore = new MockBlockMetadataStore();
    normalizedFeeCalculator = new NormalizedFeeCalculator(mockMetadataStore, 1, 1, 100, 0.000002);
  });

  describe('initialize', () => {
    it('should initialize members correctly', async (done) => {
      await normalizedFeeCalculator.initialize();
      done();
    });
  });

  describe('addNormalizedFeeToBlock', () => {
    let blockMetadataWithoutFee : BlockMetadataWithoutNormalizedFee;
    beforeEach(() => {
      blockMetadataWithoutFee = {
        height: 0,
        hash: 'hash',
        previousHash: 'prevHash',
        transactionCount: 100,
        totalFee: 100
      };
    });

    it('should return initial fee for blocks within genesis + lookBackDuration', async () => {
      blockMetadataWithoutFee.height = 100;
      const actual = await normalizedFeeCalculator.addNormalizedFeeToBlockMetadata(blockMetadataWithoutFee);
      expect(actual.normalizedFee).toEqual(1);
    });

    it('should calculate normalized fee and fetch for blocks when starting fresh', async () => {
      blockMetadataWithoutFee.height = 101;
      const getMetadataSpy = spyOn(mockMetadataStore, 'get').and.returnValue(Promise.resolve([
        {
          height: 98,
          hash: 'string',
          normalizedFee: 1000000,
          previousHash: 'string',
          transactionCount: 2,
          totalFee: 1999994
        },
        {
          height: 99,
          hash: 'string',
          normalizedFee: 1000000,
          previousHash: 'string',
          transactionCount: 1,
          totalFee: 999997
        },
        {
          height: 100,
          hash: 'string',
          normalizedFee: 1000000,
          previousHash: 'string',
          transactionCount: 10,
          totalFee: 9999970
        }
      ]));
      const actual = await normalizedFeeCalculator.addNormalizedFeeToBlockMetadata(blockMetadataWithoutFee);
      expect(actual.normalizedFee).toBeDefined();
      expect(getMetadataSpy).toHaveBeenCalled();
      expect(normalizedFeeCalculator['cachedLookBackWindow'][0].height).toEqual(99);
      expect(normalizedFeeCalculator['cachedLookBackWindow'][2].height).toEqual(101);
      expect(normalizedFeeCalculator['blockHeightOfCachedLookBackWindow']).toEqual(102);
    });

    it('should calculate normalized feeand use cache', async () => {
      blockMetadataWithoutFee.height = 101;
      normalizedFeeCalculator['blockHeightOfCachedLookBackWindow'] = 101;
      normalizedFeeCalculator['cachedLookBackWindow'] = [
        {
          height: 98,
          hash: 'string',
          normalizedFee: 1000000,
          previousHash: 'string',
          transactionCount: 2,
          totalFee: 1999994
        },
        {
          height: 99,
          hash: 'string',
          normalizedFee: 1000000,
          previousHash: 'string',
          transactionCount: 1,
          totalFee: 999997
        },
        {
          height: 100,
          hash: 'string',
          normalizedFee: 1000000,
          previousHash: 'string',
          transactionCount: 10,
          totalFee: 9999970
        }
      ];
      const getMetadataSpy = spyOn(mockMetadataStore, 'get').and.returnValue(Promise.resolve([]));
      const actual = await normalizedFeeCalculator.addNormalizedFeeToBlockMetadata(blockMetadataWithoutFee);
      expect(actual.normalizedFee).toBeDefined();
      expect(normalizedFeeCalculator['cachedLookBackWindow'][0].height).toEqual(99);
      expect(normalizedFeeCalculator['cachedLookBackWindow'][2].height).toEqual(101);
      expect(getMetadataSpy).not.toHaveBeenCalled(); // not called because there's cached data
      expect(normalizedFeeCalculator['blockHeightOfCachedLookBackWindow']).toEqual(102);
    });
  });

  describe('getNormalizedFee', () => {
    it('should return initiail fee for blocks within genesis + 100 blocks.', async (done) => {
      const actual = await normalizedFeeCalculator.getNormalizedFee(100);
      expect(actual).toEqual(1);
      done();
    });

    it('should return the correct fee above fluctuation for blocks after genesis + 100 blocks.', async (done) => {
      spyOn(mockMetadataStore, 'get').and.returnValue(Promise.resolve([
        {
          height: 98,
          hash: 'string',
          normalizedFee: 1000000,
          previousHash: 'string',
          transactionCount: 2,
          totalFee: 2000006
        },
        {
          height: 99,
          hash: 'string',
          normalizedFee: 1000000,
          previousHash: 'string',
          transactionCount: 1,
          totalFee: 1000003
        },
        {
          height: 100,
          hash: 'string',
          normalizedFee: 1000000,
          previousHash: 'string',
          transactionCount: 10,
          totalFee: 10000030
        }
      ]));
      const actual = await normalizedFeeCalculator.getNormalizedFee(101);
      const expectedFee = 1000002;
      expect(actual).toEqual(expectedFee);
      done();
    });

    it('should return the correct fee below fluctuation for blocks after genesis + 100 blocks.', async (done) => {
      spyOn(mockMetadataStore, 'get').and.returnValue(Promise.resolve([
        {
          height: 98,
          hash: 'string',
          normalizedFee: 1000000,
          previousHash: 'string',
          transactionCount: 2,
          totalFee: 1999994
        },
        {
          height: 99,
          hash: 'string',
          normalizedFee: 1000000,
          previousHash: 'string',
          transactionCount: 1,
          totalFee: 999997
        },
        {
          height: 100,
          hash: 'string',
          normalizedFee: 1000000,
          previousHash: 'string',
          transactionCount: 10,
          totalFee: 9999970
        }
      ]));
      const actual = await normalizedFeeCalculator.getNormalizedFee(101);
      const expectedFee = 999998;
      expect(actual).toEqual(expectedFee);
      done();
    });

    it('should return the correct fee within fluctuation for blocks after genesis + 100 blocks.', async (done) => {
      spyOn(mockMetadataStore, 'get').and.returnValue(Promise.resolve([
        {
          height: 98,
          hash: 'string',
          normalizedFee: 1000001,
          previousHash: 'string',
          transactionCount: 2,
          totalFee: 2000000
        },
        {
          height: 99,
          hash: 'string',
          normalizedFee: 1000001,
          previousHash: 'string',
          transactionCount: 1,
          totalFee: 1000000
        },
        {
          height: 100,
          hash: 'string',
          normalizedFee: 1000001,
          previousHash: 'string',
          transactionCount: 10,
          totalFee: 10000000
        }
      ]));
      const actual = await normalizedFeeCalculator.getNormalizedFee(101);
      const expectedFee = 1000000;
      expect(actual).toEqual(expectedFee);
      done();
    });
  });
});

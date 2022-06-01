import BlockMetadata from '../../../lib/bitcoin/models/BlockMetadata';
import BlockMetadataWithoutNormalizedFee from '../../../lib/bitcoin/models/BlockMetadataWithoutNormalizedFee';
import ErrorCode from '../../../lib/bitcoin/ErrorCode';
import IBlockMetadataStore from '../../../lib/bitcoin/interfaces/IBlockMetadataStore';
import MockBlockMetadataStore from '../../mocks/MockBlockMetadataStore';
import NormalizedFeeCalculator from '../../../lib/bitcoin/versions/latest/NormalizedFeeCalculator';

describe('NormalizedFeeCalculator', () => {
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
      normalizedFeeCalculator['feeLookBackWindowInBlocks'] = 3;
      blockMetadataWithoutFee = {
        height: 0,
        hash: 'hash',
        previousHash: 'prevHash',
        transactionCount: 100,
        totalFee: 100
      };
    });

    it('should return initial fee for blocks within genesis + lookBackDuration', async () => {
      blockMetadataWithoutFee.height = 3;
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

    it('should calculate normalized fee and use cache', async () => {
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

    it('should calculate normalized fee using db if cache does not have the correct number of blocks', async () => {
      blockMetadataWithoutFee.height = 101;
      normalizedFeeCalculator['blockHeightOfCachedLookBackWindow'] = 101;
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

      normalizedFeeCalculator['cachedLookBackWindow'] = [
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
      const actual = await normalizedFeeCalculator.addNormalizedFeeToBlockMetadata(blockMetadataWithoutFee);
      expect(actual.normalizedFee).toBeDefined();
      expect(normalizedFeeCalculator['cachedLookBackWindow'][0].height).toEqual(99);
      expect(normalizedFeeCalculator['cachedLookBackWindow'][2].height).toEqual(101);
      expect(getMetadataSpy).toHaveBeenCalled(); // not called because there's cached data
      expect(normalizedFeeCalculator['blockHeightOfCachedLookBackWindow']).toEqual(102);
    });

    it('should return the correct fee above fluctuation for blocks after genesis + 100 blocks.', async (done) => {
      blockMetadataWithoutFee.height = 101;
      normalizedFeeCalculator['blockHeightOfCachedLookBackWindow'] = 101;
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
      const actual = await normalizedFeeCalculator.addNormalizedFeeToBlockMetadata(blockMetadataWithoutFee);
      const expectedFee = 1000002;
      expect(actual.normalizedFee).toEqual(expectedFee);
      done();
    });

    it('should return the correct fee below fluctuation for blocks after genesis + 100 blocks.', async (done) => {
      blockMetadataWithoutFee.height = 101;
      normalizedFeeCalculator['blockHeightOfCachedLookBackWindow'] = 101;
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
      const actual = await normalizedFeeCalculator.addNormalizedFeeToBlockMetadata(blockMetadataWithoutFee);
      const expectedFee = 999998;
      expect(actual.normalizedFee).toEqual(expectedFee);
      done();
    });

    it('should return the correct fee within fluctuation for blocks after genesis + 100 blocks.', async (done) => {
      blockMetadataWithoutFee.height = 101;
      normalizedFeeCalculator['blockHeightOfCachedLookBackWindow'] = 101;
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
      const actual = await normalizedFeeCalculator.addNormalizedFeeToBlockMetadata(blockMetadataWithoutFee);
      const expectedFee = 1000000;
      expect(actual.normalizedFee).toEqual(expectedFee);
      done();
    });
  });

  describe('getNormalizedFee', () => {
    it('should return recalculated normalized fee from db', async () => {
      const blocks = [{
        height: 0,
        hash: 'hash',
        previousHash: 'prevHash',
        transactionCount: 100,
        totalFee: 100,
        normalizedFee: 1.1111111
      }];
      const blockMetadataGetSpy = spyOn(normalizedFeeCalculator['blockMetadataStore'], 'get').and.returnValue(Promise.resolve(blocks));
      const result = await normalizedFeeCalculator.getNormalizedFee(0);
      expect(result).toEqual(1);
      expect(blockMetadataGetSpy).toHaveBeenCalled();
    });
    it('should throw when block not yet recognized', async () => {
      const blocks : BlockMetadata[] = [];
      spyOn(normalizedFeeCalculator['blockMetadataStore'], 'get').and.returnValue(Promise.resolve(blocks));
      await expectAsync(normalizedFeeCalculator.getNormalizedFee(0)).toBeRejectedWith(jasmine.objectContaining({
        code: ErrorCode.NormalizedFeeCalculatorBlockNotFound
      }));
    });
  });

  describe('calculateNormalizedTransactionFeeFromBlock', () => {
    it('should return the correct value', () => {
      const block = {
        height: 0,
        hash: 'hash',
        previousHash: 'prevHash',
        transactionCount: 100,
        totalFee: 100,
        normalizedFee: 1.1111111
      };

      const result = normalizedFeeCalculator.calculateNormalizedTransactionFeeFromBlock(block);
      expect(result).toEqual(1);
    });
  });
});

import ErrorCode from '../../lib/bitcoin/ErrorCode';
import JasmineSidetreeErrorValidator from '../JasmineSidetreeErrorValidator';
import MockBlockMetadataStore from '../mocks/MockBlockMetadataStore';
import VersionManager from '../../lib/bitcoin/VersionManager';
import VersionModel from '../../lib/bitcoin/models/BitcoinVersionModel';

describe('VersionManager', async () => {
  describe('getFeeCalculator()', async () => {
    it('should return the correct version of fee calculator.', async () => {

      const versionModels: VersionModel[] = [
        { startingBlockchainTime: 1000, version: '1000', protocolParameters: { valueTimeLockDurationInBlocks: 5, initialNormalizedFeeInSatoshis: 1, feeLookBackWindowInBlocks: 1, feeMaxFluctuationMultiplierPerBlock: 1 } },
        { startingBlockchainTime: 2000, version: '2000', protocolParameters: { valueTimeLockDurationInBlocks: 5, initialNormalizedFeeInSatoshis: 1, feeLookBackWindowInBlocks: 1, feeMaxFluctuationMultiplierPerBlock: 1 } }
      ];

      const versionManager = new VersionManager();

      // Setting up loading of mock fee calculators.
      const mockFeeCalculator1 = class {
        getNormalizedFee () { return 1000; }
      };
      const mockFeeCalculator2 = class {
        getNormalizedFee () { return 2000; }
      };
      spyOn(versionManager as any, 'loadDefaultExportsForVersion').and.callFake(async (version: string, _className: string) => {
        if (version === '1000') {
          return mockFeeCalculator1;
        } else { // '2000'
          return mockFeeCalculator2;
        }
      });

      await versionManager.initialize(versionModels, { genesisBlockNumber: 1 } as any, new MockBlockMetadataStore());
      const fee = await versionManager.getFeeCalculator(2001).getNormalizedFee(2001);

      expect(fee).toEqual(2000);
    });
  });

  describe('getVersionString()', () => {
    it('should throw if version given is not in the supported version list.', async () => {
      const versionManager = new VersionManager();

      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => (versionManager as any).getVersionString(1),
        ErrorCode.VersionManagerVersionStringNotFound
      );
    });
  });

  describe('getLockDurationInBlocks', () => {
    it('should get the correct lock duration', async () => {
      const versionModels: VersionModel[] = [
        { startingBlockchainTime: 1000, version: '1000', protocolParameters: { valueTimeLockDurationInBlocks: 123, initialNormalizedFeeInSatoshis: 1, feeLookBackWindowInBlocks: 1, feeMaxFluctuationMultiplierPerBlock: 1 } },
        { startingBlockchainTime: 2000, version: '2000', protocolParameters: { valueTimeLockDurationInBlocks: 456, initialNormalizedFeeInSatoshis: 1, feeLookBackWindowInBlocks: 1, feeMaxFluctuationMultiplierPerBlock: 1 } }
      ];
      const versionManager = new VersionManager();
      spyOn(versionManager as any, 'loadDefaultExportsForVersion').and.callFake(async (_version: string, _className: string) => {
        return class {
          getNormalizedFee () { return 1000; }
        };
      });
      await versionManager.initialize(versionModels, { genesisBlockNumber: 1 } as any, new MockBlockMetadataStore());

      const result = versionManager.getLockDurationInBlocks(1500);
      expect(result).toEqual(123);

      const result2 = versionManager.getLockDurationInBlocks(2500);
      expect(result2).toEqual(456);
    });
  });
});

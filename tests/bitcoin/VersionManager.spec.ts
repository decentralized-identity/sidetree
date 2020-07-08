import ErrorCode from '../../lib/bitcoin/ErrorCode';
import JasmineSidetreeErrorValidator from '../JasmineSidetreeErrorValidator';
import VersionManager from '../../lib/bitcoin/VersionManager';
import VersionModel from '../../lib/common/models/VersionModel';

describe('VersionManager', async () => {
  describe('getFeeCalculator()', async () => {
    it('should return the correct version of fee calculator.', async () => {

      const versionModels: VersionModel[] = [
        { startingBlockchainTime: 1000, version: '1000' },
        { startingBlockchainTime: 2000, version: '2000' }
      ];

      const versionManager = new VersionManager(versionModels);

      // Setting up loading of mock fee calculators.
      const mockFeeCalculator1 = class {
        /* tslint:disable-next-line */
        getNormalizedFee () { return 1000; }
      };
      const mockFeeCalculator2 = class {
        /* tslint:disable-next-line */
        getNormalizedFee () { return 2000; }
      };
      spyOn(versionManager as any, 'loadDefaultExportsForVersion').and.callFake(async (version: string, _className: string) => {
        if (version === '1000') {
          return mockFeeCalculator1;
        } else { // '2000'
          return mockFeeCalculator2;
        }
      });

      await versionManager.initialize();
      const fee = versionManager.getFeeCalculator(2001).getNormalizedFee(2001);

      expect(fee).toEqual(2000);
    });
  });

  describe('getVersionString()', () => {
    it('should throw if version given is not in the supported version list.', async () => {
      const versionModels: VersionModel[] = [
        { startingBlockchainTime: 1000, version: '1000' }
      ];
      const versionManager = new VersionManager(versionModels);

      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => (versionManager as any).getVersionString(1),
        ErrorCode.VersionManagerVersionStringNotFound
      );
    });
  });
});

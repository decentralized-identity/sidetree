import Core from '../../lib/core/Core';
import ServiceVersionModel from '../../lib/common/models/ServiceVersionModel';
import { ResponseStatus } from '../../lib/common/Response';

describe('Core', async () => {

  const testConfig = require('../json/bitcoin-config-test.json');
  const testVersionConfig = require('../json/core-protocol-versioning-test.json');

  describe('handleGetVersionRequest()', async () => {
    it('should call all the dependent services', async () => {

      // Keep the 'name' property on the following model objects. The name is used to sort
      // the values alphabetically to validate the response later on.
      const expectedCoreVersion: ServiceVersionModel = { name: 'a-service', version: 'x.y.z' };
      const expectedBlockchainVersion: ServiceVersionModel = { name: 'b-service', version: 'a.b.c' };
      const expectedCasVersion: ServiceVersionModel = { name: 'c-service', version: '1.x.c' };

      const core = new Core(testConfig, testVersionConfig);

      const serviceInfoSpy = spyOn(core['serviceInfo'], 'getServiceVersion').and.returnValue(expectedCoreVersion);
      const blockchainSpy = spyOn(core['blockchain'], 'getCachedServiceVersion').and.returnValue(expectedBlockchainVersion);
      const casSpy = spyOn(core['cas'], 'getCachedServiceVersion').and.returnValue(expectedCasVersion);

      const fetchedResponse = await core.handleGetVersionRequest();

      expect(serviceInfoSpy).toHaveBeenCalled();
      expect(blockchainSpy).toHaveBeenCalled();
      expect(casSpy).toHaveBeenCalled();
      expect(fetchedResponse.status).toEqual(ResponseStatus.Succeeded);

      // Sort the output to make it easier to validate
      let fetchedVersions: ServiceVersionModel[] = JSON.parse(fetchedResponse.body);
      fetchedVersions.sort((a, b) => a.name > b.name ? 1 : -1);

      expect(fetchedVersions[0]).toEqual(expectedCoreVersion);
      expect(fetchedVersions[1]).toEqual(expectedBlockchainVersion);
      expect(fetchedVersions[2]).toEqual(expectedCasVersion);
    });
  });
});

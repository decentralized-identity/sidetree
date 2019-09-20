import ReadableStream from '../../lib/common/ReadableStream';
import ServiceInfoProvider from '../../lib/common/ServiceInfoProvider';
import ServiceVersionFetcher from '../../lib/core/ServiceVersionFetcher';
import ServiceVersionModel from '../../lib/common/models/ServiceVersionModel';

describe('ServiceVersionFetcher', async () => {
  describe('getVersion()', async () => {
    it('should get version by making a REST api call.', async () => {
      const expectedServiceVersion: ServiceVersionModel = { name: 'test-service', version: 'x.y.z' };
      const serviceVersionFetcher = new ServiceVersionFetcher('someURI');

      const fetchSpy = spyOn(serviceVersionFetcher as any, 'fetch').and.returnValue(Promise.resolve({ status: 200 }));
      const readStreamSpy = spyOn(ReadableStream, 'readAll').and.returnValue(Promise.resolve(JSON.stringify(expectedServiceVersion)));

      const version = await serviceVersionFetcher.getVersion();

      expect(fetchSpy).toHaveBeenCalled();
      expect(readStreamSpy).toHaveBeenCalled();
      expect(version).toEqual(expectedServiceVersion);
    });

    it('should return undefined version if there is an exception during version REST call.', async () => {
      const serviceVersionFetcher = new ServiceVersionFetcher('someURI');

      const fetchSpy = spyOn(serviceVersionFetcher as any, 'fetch').and.throwError('some error.');

      const version = await serviceVersionFetcher.getVersion();

      expect(fetchSpy).toHaveBeenCalled();
      expect(version).toEqual(ServiceInfoProvider.emptyServiceVersion);
    });
  });
});

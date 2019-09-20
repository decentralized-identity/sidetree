import ReadableStream from '../../lib/common/ReadableStream';
import ServiceInfoProvider from '../../lib/common/ServiceInfoProvider';
import ServiceVersionFetcher from '../../lib/core/ServiceVersionFetcher';
import ServiceVersionModel from '../../lib/common/models/ServiceVersionModel';

describe('ServiceVersionFetcher', async () => {
  describe('initialize', async () => {
    it('should get version by making a REST api call.', async () => {
      const expectedServiceVersion: ServiceVersionModel = { name: 'test-service', version: 'x.y.z' };
      const serviceVersionFetcher = new ServiceVersionFetcher('someURI');

      const fetchSpy = spyOn(serviceVersionFetcher as any, 'fetch').and.returnValue(Promise.resolve({ status: 200 }));
      const readStreamSpy = spyOn(ReadableStream, 'readAll').and.returnValue(Promise.resolve(JSON.stringify(expectedServiceVersion)));

      await serviceVersionFetcher.initialize();

      expect(fetchSpy).toHaveBeenCalled();
      expect(readStreamSpy).toHaveBeenCalled();
      expect(serviceVersionFetcher.getCachedVersion()).toEqual(expectedServiceVersion);
    });

    it('should not block initialize if there is an exception during version REST call.', async () => {
      const serviceVersionFetcher = new ServiceVersionFetcher('someURI');

      const fetchSpy = spyOn(serviceVersionFetcher as any, 'fetch').and.throwError('some error.');
      await serviceVersionFetcher.initialize();

      expect(fetchSpy).toHaveBeenCalled();
      expect(serviceVersionFetcher.getCachedVersion()).toEqual(ServiceInfoProvider.emptyServiceVersion);
    });
  });
});
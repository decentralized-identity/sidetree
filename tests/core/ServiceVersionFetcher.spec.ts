import ReadableStream from '../../lib/common/ReadableStream';
import ServiceVersionFetcher from '../../lib/core/ServiceVersionFetcher';
import ServiceVersionModel from '../../lib/common/models/ServiceVersionModel';

describe('ServiceVersionFetcher', async () => {

  describe('getVersion()', async () => {
    it('should get version by making a REST api call.', async () => {
      const expectedServiceVersion: ServiceVersionModel = { name: 'test-service', version: 'x.y.z' };
      const serviceVersionFetcher = new ServiceVersionFetcher('someURI');

      const fetchSpy = spyOn(serviceVersionFetcher as any, 'fetch').and.returnValue(Promise.resolve({ status: 200 }));
      const readAllSpy = spyOn(ReadableStream, 'readAll').and.returnValue(Promise.resolve(Buffer.from(JSON.stringify(expectedServiceVersion))));

      const version = await serviceVersionFetcher.getVersion();

      expect(fetchSpy).toHaveBeenCalled();
      expect(readAllSpy).toHaveBeenCalled();
      expect(version).toEqual(expectedServiceVersion);
    });

    it('should return undefined version if there is an exception during version REST call.', async () => {
      const serviceVersionFetcher = new ServiceVersionFetcher('someURI');

      const fetchSpy = spyOn(serviceVersionFetcher as any, 'fetch').and.throwError('some error.');

      const version = await serviceVersionFetcher.getVersion();

      expect(fetchSpy).toHaveBeenCalled();
      expect(version.name).toEqual('undefined');
      expect(version.version).toEqual('undefined');
    });

    it('should not fetch again if last fetch was within the threshold.', async () => {
      const serviceVersionFetcher = new ServiceVersionFetcher('someURI');

      // throw error on fetch to make sure that cached version is 'empty'
      const fetchSpy = spyOn(serviceVersionFetcher as any, 'fetch').and.throwError('some error.');
      const tryGetServiceVersionSpy = spyOn(serviceVersionFetcher as any, 'tryGetServiceVersion').and.callThrough();

      await serviceVersionFetcher.getVersion();

      expect(fetchSpy).toHaveBeenCalled();
      expect(tryGetServiceVersionSpy).toHaveBeenCalled();

      // Call getVersion again and ensure that the network call didn't happen
      await serviceVersionFetcher.getVersion();

      expect(tryGetServiceVersionSpy.calls.count()).toEqual(1);
    });

    it('should fetch again if last fetch was outside the threshold.', async () => {
      const expectedServiceVersion: ServiceVersionModel = { name: 'test-service', version: 'x.y.z' };
      const serviceVersionFetcher = new ServiceVersionFetcher('someURI');

      const fetchSpy = spyOn(serviceVersionFetcher as any, 'fetch').and.returnValue(Promise.resolve({ status: 200 }));
      const readAllSpy = spyOn(ReadableStream, 'readAll').and.returnValue(Promise.resolve(Buffer.from(JSON.stringify(expectedServiceVersion))));
      const tryGetServiceVersionSpy = spyOn(serviceVersionFetcher as any, 'tryGetServiceVersion').and.callThrough();

      await serviceVersionFetcher.getVersion();

      expect(fetchSpy).toHaveBeenCalled();
      expect(readAllSpy).toHaveBeenCalled();
      expect(tryGetServiceVersionSpy).toHaveBeenCalled();

      // Update the last fetch time to ensure another network call
      const fetchWaitTimeInMillisecs = (10 * 60 * 1000) + 1; // 10 mins + 1 millisec
      const futureTimeInMillisecs = Date.now() + fetchWaitTimeInMillisecs;
      spyOn(Date, 'now').and.returnValue(futureTimeInMillisecs);

      // Call getVersion again and ensure that another network call was made
      await serviceVersionFetcher.getVersion();

      expect(fetchSpy.calls.count()).toEqual(2);
      expect(tryGetServiceVersionSpy.calls.count()).toEqual(2);
    });
  });
});

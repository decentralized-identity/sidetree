import Cas from '../../lib/core/Cas';
import ReadableStream from '../../lib/common/ReadableStream';
import { FetchResultCode } from '../../lib/common/FetchResultCode';
import ServiceVersionModel from '../../lib/common/models/ServiceVersionModel';
import ServiceInfo from '../../lib/common/ServiceInfo';

describe('Cas', async () => {
  it('should return file hash of the content written.', async () => {
    const casClient = new Cas('unused');
    const fetchSpy = spyOn(casClient as any, 'fetch').and.returnValue(Promise.resolve({ status: 200, body: 'unused' }));
    const readStreamSpy = spyOn(ReadableStream, 'readAll').and.returnValue(Promise.resolve('{"hash":"abc"}'));
    const hash = await casClient.write(Buffer.from('unused'));

    expect(fetchSpy).toHaveBeenCalled();
    expect(readStreamSpy).toHaveBeenCalled();
    expect(hash).toEqual('abc');
  });

  it('should throw if content writing returned with an error.', async () => {
    const casClient = new Cas('unused');
    spyOn(casClient as any, 'fetch').and.returnValue(Promise.resolve({ status: 500, body: 'unused' }));
    spyOn(ReadableStream, 'readAll').and.returnValue(Promise.resolve('abc'));

    try {
      await casClient.write(Buffer.from('unused'));
    } catch {
      // Throwing error is the expected case.
      return;
    }

    fail();
  });

  it('should set fetch result as not-found when fetch result in an unexpected error.', async () => {
    const casClient = new Cas('unused');
    const fetchSpy = spyOn(casClient as any, 'fetch').and.returnValue(Promise.resolve({ status: 200, body: 'unused' }));
    const readStreamSpy = spyOn(ReadableStream, 'readAll').and.returnValue(Promise.resolve('abc'));
    const fetchResult = await casClient.read('anyAddress', 1);

    expect(fetchSpy).toHaveBeenCalled();
    expect(readStreamSpy).toHaveBeenCalled();
    expect(fetchResult.code).toEqual(FetchResultCode.Success);
    expect(fetchResult.content!.toString()).toEqual('abc');
  });

  it('should set fetch result as not-found when fetch result in an unexpected error.', async () => {
    const casClient = new Cas('unused');
    const fetchSpy = spyOn(casClient as any, 'fetch').and.returnValue(Promise.resolve({ status: 500, body: 'unused' }));
    const readStreamSpy = spyOn(ReadableStream, 'readAll').and.returnValue(Promise.resolve(JSON.stringify({
      code: 'unused'
    })));
    const fetchResult = await casClient.read('anyAddress', 1);

    expect(fetchSpy).toHaveBeenCalled();
    expect(readStreamSpy).toHaveBeenCalled();
    expect(fetchResult.code).toEqual(FetchResultCode.NotFound);
  });

  it('should set fetch result correctly when fetch responds with a not-found.', async () => {
    const casClient = new Cas('unused');
    const fetchSpy = spyOn(casClient as any, 'fetch').and.returnValue(Promise.resolve({ status: 404 }));

    const fetchResult = await casClient.read('anyAddress', 1);

    expect(fetchSpy).toHaveBeenCalled();
    expect(fetchResult.code).toEqual(FetchResultCode.NotFound);
  });

  it('should set fetch result correctly when fetch responds with a bad-request.', async () => {
    const casClient = new Cas('unused');
    const fetchSpy = spyOn(casClient as any, 'fetch').and.returnValue(Promise.resolve({ status: 400 }));
    const readStreamSpy = spyOn(ReadableStream, 'readAll').and.returnValue(Promise.resolve(JSON.stringify({
      code: FetchResultCode.InvalidHash
    })));

    const fetchResult = await casClient.read('anyAddress', 1);

    expect(fetchSpy).toHaveBeenCalled();
    expect(readStreamSpy).toHaveBeenCalled();
    expect(fetchResult.code).toEqual(FetchResultCode.InvalidHash);
  });

  describe("initialize", async () => {
    it('should get version by making a REST api call.', async () => {
      const casClient = new Cas('unused');
      const expectedServiceVersion: ServiceVersionModel = { name: 'test-service', version: 'x.y.z' };

      const fetchSpy = spyOn(casClient as any, 'fetch').and.returnValue(Promise.resolve({ status: 200 }));
      const readStreamSpy = spyOn(ReadableStream, 'readAll').and.returnValue(Promise.resolve(JSON.stringify(expectedServiceVersion)));

      await casClient.initialize();

      expect(fetchSpy).toHaveBeenCalled();
      expect(readStreamSpy).toHaveBeenCalled();
      expect(casClient.getCachedServiceVersion()).toEqual(expectedServiceVersion);
    });

    it('should not block initialize if there is an exception during version REST call.', async () => {
      const casClient = new Cas('unused');

      const fetchSpy = spyOn(casClient as any, 'fetch').and.throwError("some error.");
      await casClient.initialize();

      expect(fetchSpy).toHaveBeenCalled();
      expect(casClient.getCachedServiceVersion()).toEqual(ServiceInfo.getEmptyServiceVersion());
    });
  });
});

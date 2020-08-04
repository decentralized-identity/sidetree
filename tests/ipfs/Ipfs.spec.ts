import Ipfs from '../../lib/ipfs/Ipfs';
import FetchResultCode from '../../lib/common/enums/FetchResultCode';
import ReadableStream from '../../lib/common/ReadableStream';

describe('Ipfs', async () => {
  it('should return file hash of the content written.', async () => {
    const casClient = new Ipfs('unused');
    const fetchSpy = spyOn(casClient as any, 'fetch').and.returnValue(Promise.resolve({ status: 200, body: 'unused' }));
    const readStreamSpy = spyOn(ReadableStream, 'readAll').and.returnValue(Promise.resolve(Buffer.from('{"hash":"abc"}')));
    const hash = await casClient.write(Buffer.from('unused'));

    expect(fetchSpy).toHaveBeenCalled();
    expect(readStreamSpy).toHaveBeenCalled();
    expect(hash).toEqual('abc');
  });

  it('should throw if content writing returned with an error.', async () => {
    const casClient = new Ipfs('unused');
    spyOn(casClient as any, 'fetch').and.returnValue(Promise.resolve({ status: 500, body: 'unused' }));
    spyOn(ReadableStream, 'readAll').and.returnValue(Promise.resolve(Buffer.from('abc')));

    try {
      await casClient.write(Buffer.from('unused'));
    } catch {
      // Throwing error is the expected case.
      return;
    }

    fail();
  });

  it('should set fetch result as not-found when fetch result in an unexpected error.', async () => {
    const casClient = new Ipfs('unused');
    const fetchSpy = spyOn(casClient as any, 'fetch').and.returnValue(Promise.resolve({ status: 200, body: 'unused' }));
    const readStreamSpy = spyOn(ReadableStream, 'readAll').and.returnValue(Promise.resolve(Buffer.from('abc')));
    const fetchResult = await casClient.read('anyAddress', 1);

    expect(fetchSpy).toHaveBeenCalled();
    expect(readStreamSpy).toHaveBeenCalled();
    expect(fetchResult.code).toEqual(FetchResultCode.Success);
    expect(fetchResult.content!.toString()).toEqual('abc');
  });

  it('should set fetch result as not-found when fetch result in an unexpected error.', async () => {
    const casClient = new Ipfs('unused');
    const fetchSpy = spyOn(casClient as any, 'fetch').and.returnValue(Promise.resolve({ status: 500, body: 'unused' }));
    const readStreamSpy = spyOn(ReadableStream, 'readAll').and.returnValue(Promise.resolve(Buffer.from(JSON.stringify({
      code: 'unused'
    }))));
    const fetchResult = await casClient.read('anyAddress', 1);

    expect(fetchSpy).toHaveBeenCalled();
    expect(readStreamSpy).toHaveBeenCalled();
    expect(fetchResult.code).toEqual(FetchResultCode.NotFound);
  });

  it('should set fetch result correctly when fetch responds with a not-found.', async () => {
    const casClient = new Ipfs('unused');
    const fetchSpy = spyOn(casClient as any, 'fetch').and.returnValue(Promise.resolve({ status: 404 }));

    const fetchResult = await casClient.read('anyAddress', 1);

    expect(fetchSpy).toHaveBeenCalled();
    expect(fetchResult.code).toEqual(FetchResultCode.NotFound);
  });

  it('should set fetch result correctly when fetch responds with a bad-request.', async () => {
    const casClient = new Ipfs('unused');
    const fetchSpy = spyOn(casClient as any, 'fetch').and.returnValue(Promise.resolve({ status: 400 }));
    const readStreamSpy = spyOn(ReadableStream, 'readAll').and.returnValue(Promise.resolve(Buffer.from(JSON.stringify({
      code: FetchResultCode.InvalidHash
    }))));

    const fetchResult = await casClient.read('anyAddress', 1);

    expect(fetchSpy).toHaveBeenCalled();
    expect(readStreamSpy).toHaveBeenCalled();
    expect(fetchResult.code).toEqual(FetchResultCode.InvalidHash);
  });
});

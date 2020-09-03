import FetchResultCode from '../../lib/common/enums/FetchResultCode';
import ReadableStream from '../../lib/common/ReadableStream';
import ICas from '../../lib/core/interfaces/ICas';
import Ipfs from '../../lib/ipfs/Ipfs';
import IpfsErrorCode from '../../lib/ipfs/IpfsErrorCode';
import JasmineSidetreeErrorValidator from '../JasmineSidetreeErrorValidator';
import SharedErrorCode from '../../lib/common/SharedErrorCode';
import SidetreeError from '../../lib/common/SidetreeError';
import Timeout from '../../lib/ipfs/Util/Timeout';

describe('Ipfs', async () => {
  let casClient: ICas;

  beforeEach(() => {
    const fetchTimeoutInSeconds = 1;
    casClient = new Ipfs('unused', fetchTimeoutInSeconds);
  });

  describe('write()', async () => {
    it('should return file hash of the content written.', async () => {
      const fetchSpy = spyOn(casClient as any, 'fetch').and.returnValue(Promise.resolve({ status: 200, body: 'unused' }));
      const readAllSpy = spyOn(ReadableStream, 'readAll')
        .and.returnValue(Promise.resolve(Buffer.from(JSON.stringify({ Hash: 'QmWCcaE2iTRnJxqaC4VGFhD6ARsqRNPe2D2eYJTWgeP7ko' }))));
      const hash = await casClient.write(Buffer.from('unused'));

      expect(fetchSpy).toHaveBeenCalled();
      expect(readAllSpy).toHaveBeenCalled();
      expect(hash).toEqual('EiB0zm8TToaK5Z97V43iIwfJJzgx25SgMOhLwOerD3KgJA'); // hash here is based64 encoded string. `readAll()` returns base58 encoded string.
    });

    it('should throw if content writing IPFS HTTP API returned a non-OK status with or without body', async () => {
      spyOn(casClient as any, 'fetch').and.returnValue(Promise.resolve({ status: 500, body: 'unused' }));
      spyOn(ReadableStream, 'readAll').and.returnValue(Promise.resolve(Buffer.from('abc')));

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => casClient.write(Buffer.from('unused')),
        IpfsErrorCode.IpfsFailedWritingContent
      );
    });

    it('should throw if content writing IPFS HTTP API returned a non-OK status without body', async () => {
      spyOn(casClient as any, 'fetch').and.returnValue(Promise.resolve({ status: 500 }));
      spyOn(ReadableStream, 'readAll').and.returnValue(Promise.resolve(Buffer.from('abc')));

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => casClient.write(Buffer.from('unused')),
        IpfsErrorCode.IpfsFailedWritingContent
      );
    });
  });

  describe('read()', async () => {
    it('should set fetch result as success when fetch is successful.', async () => {
      const fetchSpy = spyOn(casClient as any, 'fetch').and.returnValue(Promise.resolve({ status: 200, body: 'unused' }));
      const readAllSpy = spyOn(ReadableStream, 'readAll').and.returnValue(Promise.resolve(Buffer.from('abc')));
      const fetchResult = await casClient.read('EiCGEBPkUOwS6vKY0NXkrhSFj1obfNhlWfFcIUFhczR02w', 1);

      expect(fetchSpy).toHaveBeenCalled();
      expect(readAllSpy).toHaveBeenCalled();
      expect(fetchResult.code).toEqual(FetchResultCode.Success);
      expect(fetchResult.content!.toString()).toEqual('abc');
    });

    it('should set fetch result as not-found when IPFS HTTP API returns non OK status.', async () => {
      const fetchSpy = spyOn(casClient as any, 'fetch').and.returnValue(Promise.resolve({ status: 500, body: 'unused' }));
      const readAllSpy = spyOn(ReadableStream, 'readAll').and.returnValue(Promise.resolve(Buffer.from(JSON.stringify({
        code: 'unused'
      }))));
      const fetchResult = await casClient.read('EiCGEBPkUOwS6vKY0NXkrhSFj1obfNhlWfFcIUFhczR02w', 1);

      expect(fetchSpy).toHaveBeenCalled();
      expect(readAllSpy).toHaveBeenCalled();
      expect(fetchResult.code).toEqual(FetchResultCode.NotFound);
    });

    it('should set fetch result as not-found when `timeout()` throws an unexpected error.', async () => {
      const fetchContentSpy = spyOn(casClient as any, 'fetchContent');
      const timeoutSpy = spyOn(Timeout, 'timeout').and.throwError('any unexpected error');
      const fetchResult = await casClient.read('EiCGEBPkUOwS6vKY0NXkrhSFj1obfNhlWfFcIUFhczR02w', 1);

      expect(fetchContentSpy).toHaveBeenCalled();
      expect(timeoutSpy).toHaveBeenCalled();
      expect(fetchResult.code).toEqual(FetchResultCode.NotFound);
    });

    it('should set fetch result as not-found when `timeout()` throws a timeout error.', async () => {
      const fetchContentSpy = spyOn(casClient as any, 'fetchContent');
      const timeoutSpy = spyOn(Timeout, 'timeout').and.callFake(() => { throw new SidetreeError(IpfsErrorCode.TimeoutPromiseTimedOut); });
      const fetchResult = await casClient.read('EiCGEBPkUOwS6vKY0NXkrhSFj1obfNhlWfFcIUFhczR02X', 1);

      expect(fetchContentSpy).toHaveBeenCalled();
      expect(timeoutSpy).toHaveBeenCalled();
      expect(fetchResult.code).toEqual(FetchResultCode.NotFound);
    });

    it('should set fetch result correctly when given hash is invalid.', async () => {
      const fetchResult = await casClient.read('anyInvalidHash', 1);
      expect(fetchResult.code).toEqual(FetchResultCode.InvalidHash);
    });

    it('should return correct fetch result code if IPFS service is not reachable.', async () => {
      // Simulate IPFS not reachable.
      const fetchContentSpy = spyOn(casClient as any, 'fetch').and.callFake(() => {
        const error = new Error('any error message');
        (error as any).code = 'ECONNREFUSED';
        throw error;
      });
      const fetchResult = await casClient.read('EiBIRxuYXzo1wChnyefwXx5TCSIBKjvHDi9eG20iDzp_Vw', 1);

      expect(fetchContentSpy).toHaveBeenCalled();
      expect(fetchResult.code).toEqual(FetchResultCode.CasNotReachable);
    });

    it('should return as content not found if `fetch()` throws unexpected error.', async () => {
      // Simulate IPFS not reachable.
      const fetchContentSpy = spyOn(casClient as any, 'fetch').and.throwError('any unexpected error');
      const fetchResult = await casClient.read('EiBIRxuYXzo1wChnyefwXx5TCSIBKjvHDi9eG20iDzp_Vw', 1);

      expect(fetchContentSpy).toHaveBeenCalled();
      expect(fetchResult.code).toEqual(FetchResultCode.NotFound);
    });

    it('should return as content not found if unexpected error occurred while reading the content stream.', async () => {
      const mockFetchResponse = { status: 200 };
      spyOn(casClient as any, 'fetch').and.returnValue(Promise.resolve(mockFetchResponse));

      spyOn(ReadableStream, 'readAll').and.throwError('any unexpected error');

      const fetchResult = await casClient.read('EiBIRxuYXzo1wChnyefwXx5TCSIBKjvHDi9eG20iDzp_Vw', 1);
      expect(fetchResult.code).toEqual(FetchResultCode.NotFound);
    });

    it('should return correct fetch result code if content found is not a file.', async () => {
      const mockFetchResponse = { status: 500 };
      const fetchSpy = spyOn(casClient as any, 'fetch').and.returnValue(Promise.resolve(mockFetchResponse));

      const readAllSpy = spyOn(ReadableStream, 'readAll')
        .and.returnValue(Promise.resolve(Buffer.from(JSON.stringify({ Message: 'this dag node is a directory' }))));

      const fetchResult = await casClient.read('EiCGEBPkUOwS6vKY0NXkrhSFj1obfNhlWfFcIUFhczR02w', 1);

      expect(fetchSpy).toHaveBeenCalled();
      expect(readAllSpy).toHaveBeenCalled();
      expect(fetchResult.code).toEqual(FetchResultCode.NotAFile);
    });

    it('should return correct fetch result code if content max size is exceeded.', async () => {
      const mockFetchResponse = { status: 200 };
      const fetchSpy = spyOn(casClient as any, 'fetch').and.returnValue(Promise.resolve(mockFetchResponse));

      const readAllSpy = spyOn(ReadableStream, 'readAll').and.callFake(() => {
        throw new SidetreeError(SharedErrorCode.ReadableStreamMaxAllowedDataSizeExceeded);
      });

      const fetchResult = await casClient.read('EiCGEBPkUOwS6vKY0NXkrhSFj1obfNhlWfFcIUFhczR02w', 1);

      expect(fetchSpy).toHaveBeenCalled();
      expect(readAllSpy).toHaveBeenCalled();
      expect(fetchResult.code).toEqual(FetchResultCode.MaxSizeExceeded);
    });
  });
});

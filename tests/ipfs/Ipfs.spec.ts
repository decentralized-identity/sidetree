import nodeFetch from 'node-fetch';
import FetchResultCode from '../../lib/common/enums/FetchResultCode';
import ICas from '../../lib/core/interfaces/ICas';
import Ipfs from '../../lib/ipfs/Ipfs';
import IpfsErrorCode from '../../lib/ipfs/IpfsErrorCode';
import JasmineSidetreeErrorValidator from '../JasmineSidetreeErrorValidator';
import ReadableStream from '../../lib/common/ReadableStream';
import SharedErrorCode from '../../lib/common/SharedErrorCode';
import SidetreeError from '../../lib/common/SidetreeError';
import Timeout from '../../lib/ipfs/Util/Timeout';

describe('Ipfs', async () => {
  const config = require('../json/config-test.json');
  let casClient: ICas;
  let networkAvailable = false;
  beforeAll(async () => {
    // test network connectivity, `networkAvailable` is used by tests to decide whether to run tests through real network calls or stubs
    const ipfsVersionUrl = new URL('/api/v0/version', config.ipfsHttpApiEndpointUri).toString();
    try {
      const response = await nodeFetch(ipfsVersionUrl, { method: 'POST' });

      if(response.status === 200) {
        networkAvailable = true;
      }
    } catch {
      // no op, all tests will run through stubs
    }
  });

  beforeEach(() => {
    const fetchTimeoutInSeconds = 1;
    casClient = new Ipfs(config.ipfsHttpApiEndpointUri, fetchTimeoutInSeconds);
  });

  describe('write()', async () => {
    it('should return file hash of the content written.', async () => {

      // stub network call if network is not available
      // testing using real network calls will help detect regression such as https://github.com/decentralized-identity/sidetree/issues/1188
      if (!networkAvailable) {
        spyOn(casClient as any, 'fetch').and.returnValue(Promise.resolve({ status: 200, body: 'unused' }));
        spyOn(ReadableStream, 'readAll')
          .and.returnValue(Promise.resolve(Buffer.from(JSON.stringify({ Hash: 'QmNaJwbzQuMwBdBk24WqyinzMNWsiK1rJPN1WnL4uwKQaA' }))));
      }

      const hash = await casClient.write(Buffer.from('anyBuffer'));
      expect(hash).toEqual('QmNaJwbzQuMwBdBk24WqyinzMNWsiK1rJPN1WnL4uwKQaA');
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
    it('should set fetch CIDv0 result as success when fetch is successful.', async () => {
      const fetchSpy = spyOn(casClient as any, 'fetch').and.returnValue(Promise.resolve({ status: 200, body: 'unused' }));
      const readAllSpy = spyOn(ReadableStream, 'readAll').and.returnValue(Promise.resolve(Buffer.from('abc')));
      const fetchResult = await casClient.read('QmWCcaE2iTRnJxqaC4VGFhD6ARsqRNPe2D2eYJTWgeP7ko', 1);

      expect(fetchSpy).toHaveBeenCalled();
      expect(readAllSpy).toHaveBeenCalled();
      expect(fetchResult.code).toEqual(FetchResultCode.Success);
      expect(fetchResult.content!.toString()).toEqual('abc');
    });

    it('should set fetch CIDv1 result as success when fetch is successful.', async () => {
      const fetchSpy = spyOn(casClient as any, 'fetch').and.returnValue(Promise.resolve({ status: 200, body: 'unused' }));
      const readAllSpy = spyOn(ReadableStream, 'readAll').and.returnValue(Promise.resolve(Buffer.from('abc')));
      const fetchResult = await casClient.read('bafkreid5uh2g5gbbhvpza4mwfwbmigy43rar2xkalwtvc7v34b4557cr2i', 1);

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
      const fetchResult = await casClient.read('QmWCcaE2iTRnJxqaC4VGFhD6ARsqRNPe2D2eYJTWgeP7ko', 1);

      expect(fetchSpy).toHaveBeenCalled();
      expect(readAllSpy).toHaveBeenCalled();
      expect(fetchResult.code).toEqual(FetchResultCode.NotFound);
    });

    it('should set fetch result as not-found when `timeout()` throws an unexpected error.', async () => {
      const fetchContentSpy = spyOn(casClient as any, 'fetchContent');
      const timeoutSpy = spyOn(Timeout, 'timeout').and.throwError('any unexpected error');
      const fetchResult = await casClient.read('QmWCcaE2iTRnJxqaC4VGFhD6ARsqRNPe2D2eYJTWgeP7ko', 1);

      expect(fetchContentSpy).toHaveBeenCalled();
      expect(timeoutSpy).toHaveBeenCalled();
      expect(fetchResult.code).toEqual(FetchResultCode.NotFound);
    });

    it('should set fetch result as not-found when `timeout()` throws a timeout error.', async () => {
      const fetchContentSpy = spyOn(casClient as any, 'fetchContent');
      const timeoutSpy = spyOn(Timeout, 'timeout').and.callFake(() => { throw new SidetreeError(IpfsErrorCode.TimeoutPromiseTimedOut); });
      const fetchResult = await casClient.read('QmWCcaE2iTRnJxqaC4VGFhD6ARsqRNPe2D2eYJTWgeP7ko', 1);

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
      const fetchResult = await casClient.read('QmWCcaE2iTRnJxqaC4VGFhD6ARsqRNPe2D2eYJTWgeP7ko', 1);

      expect(fetchContentSpy).toHaveBeenCalled();
      expect(fetchResult.code).toEqual(FetchResultCode.CasNotReachable);
    });

    it('should return as content not found if `fetch()` throws unexpected error.', async () => {
      // Simulate IPFS not reachable.
      const fetchContentSpy = spyOn(casClient as any, 'fetch').and.throwError('any unexpected error');
      const fetchResult = await casClient.read('QmWCcaE2iTRnJxqaC4VGFhD6ARsqRNPe2D2eYJTWgeP7ko', 1);

      expect(fetchContentSpy).toHaveBeenCalled();
      expect(fetchResult.code).toEqual(FetchResultCode.NotFound);
    });

    it('should return as content not found if unexpected error occurred while reading the content stream.', async () => {
      const mockFetchResponse = { status: 200 };
      spyOn(casClient as any, 'fetch').and.returnValue(Promise.resolve(mockFetchResponse));

      spyOn(ReadableStream, 'readAll').and.throwError('any unexpected error');

      const fetchResult = await casClient.read('QmWCcaE2iTRnJxqaC4VGFhD6ARsqRNPe2D2eYJTWgeP7ko', 1);
      expect(fetchResult.code).toEqual(FetchResultCode.NotFound);
    });

    it('should return correct fetch result code if content found is not a file.', async () => {
      const mockFetchResponse = { status: 500 };
      const fetchSpy = spyOn(casClient as any, 'fetch').and.returnValue(Promise.resolve(mockFetchResponse));

      const readAllSpy = spyOn(ReadableStream, 'readAll')
        .and.returnValue(Promise.resolve(Buffer.from(JSON.stringify({ Message: 'this dag node is a directory' }))));

      const fetchResult = await casClient.read('QmWCcaE2iTRnJxqaC4VGFhD6ARsqRNPe2D2eYJTWgeP7ko', 1);

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

      const fetchResult = await casClient.read('QmWCcaE2iTRnJxqaC4VGFhD6ARsqRNPe2D2eYJTWgeP7ko', 1);

      expect(fetchSpy).toHaveBeenCalled();
      expect(readAllSpy).toHaveBeenCalled();
      expect(fetchResult.code).toEqual(FetchResultCode.MaxSizeExceeded);
    });
  });
});

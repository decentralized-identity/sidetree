import * as IPFS from 'ipfs';
import { AsyncExecutor, AsyncTimeoutError } from '../../lib/common/async/AsyncExecutor';
import FetchResultCode from '../../lib/common/FetchResultCode';
import IpfsStorage from '../../lib/ipfs/IpfsStorage';
import MockAsyncIterable from '../mocks/MockAsyncIterable';
import { randomBytes } from 'crypto';

describe('IpfsStorage', () => {
  let ipfsStorage: IpfsStorage;
  let maxFileSize: number;

  beforeAll(async () => {
    try {
      ipfsStorage = await IpfsStorage.createSingleton();
    } catch {
      ipfsStorage = IpfsStorage.getSingleton();
    }
    maxFileSize = 20000000; // 20MB
  });

  describe('read', () => {
    it('should return the pinned content for the given hash.', async () => {
      const mockContentStat = {
        Hash: 'dummyHahs',
        NumLinks: 0,
        BlockSize: 1,
        LinksSize: 0,
        DataSize: 1024,
        CumulativeSize: 1024
      };
      const mockContent = Buffer.from('ipfs');
      spyOn(ipfsStorage['node'].object, 'stat').and.returnValue(Promise.resolve(mockContentStat));
      spyOn(ipfsStorage['node'].pin, 'add').and.returnValue(Promise.resolve([true]));
      spyOn(ipfsStorage['node'], 'cat').and.returnValue(new MockAsyncIterable(mockContent, mockContent, 1));

      const expectedContent = mockContent;

      const fetchedContent = await ipfsStorage.read('abc123', maxFileSize);
      expect(expectedContent).toEqual(fetchedContent.content!);
    });

    it('should return not found if stat throws error', async () => {
      spyOn(ipfsStorage['node'].object, 'stat').and.throwError('A test error thrown by unit test');

      const mockFetchContentFunction = async () => {
        return {
          code: FetchResultCode.Success,
          content: Buffer.from('ipfs')
        };
      };
      spyOn(ipfsStorage as any, 'fetchContent').and.callFake(mockFetchContentFunction);
      spyOn(ipfsStorage['node'].pin, 'add').and.returnValue(Promise.resolve([true]));

      const expectedErrorCode = FetchResultCode.NotFound;
      const fetchedContent = await ipfsStorage.read('abc123', maxFileSize);
      expect(expectedErrorCode).toEqual(fetchedContent.code);
    });

    it('should return size exceeded if size labeled is greater than maxFileSize limit.', async () => {
      const mockContentStat = {
        Hash: 'dummyHahs',
        NumLinks: 0,
        BlockSize: 1,
        LinksSize: 0,
        DataSize: 9999999999,
        CumulativeSize: 999999999999
      };
      spyOn(ipfsStorage['node'].object, 'stat').and.returnValue(Promise.resolve(mockContentStat));

      const mockFetchContentFunction = async () => {
        return {
          code: FetchResultCode.Success,
          content: Buffer.from('ipfs')
        };
      };
      spyOn(ipfsStorage as any, 'fetchContent').and.callFake(mockFetchContentFunction);
      spyOn(ipfsStorage['node'].pin, 'add').and.returnValue(Promise.resolve([true]));

      const expectedErrorCode = FetchResultCode.MaxSizeExceeded;
      const fetchedContent = await ipfsStorage.read('abc123', maxFileSize);
      expect(expectedErrorCode).toEqual(fetchedContent.code);
    });

    it('should return not found if size labeled is undefined.', async () => {
      const mockContentStat = {
        Hash: 'dummyHahs',
        NumLinks: 0,
        BlockSize: 1,
        LinksSize: 0,
        DataSize: undefined,
        CumulativeSize: 999999999999
      };
      spyOn(ipfsStorage['node'].object, 'stat').and.returnValue(Promise.resolve(mockContentStat));

      const mockFetchContentFunction = async () => {
        return {
          code: FetchResultCode.Success,
          content: Buffer.from('ipfs')
        };
      };
      spyOn(ipfsStorage as any, 'fetchContent').and.callFake(mockFetchContentFunction);
      spyOn(ipfsStorage['node'].pin, 'add').and.returnValue(Promise.resolve([true]));

      const expectedErrorCode = FetchResultCode.NotFound;
      const fetchedContent = await ipfsStorage.read('abc123', maxFileSize);
      expect(expectedErrorCode).toEqual(fetchedContent.code);
    });

    it('should return not found if stat returns undefined.', async () => {
      const mockContentStat = undefined;
      spyOn(ipfsStorage['node'].object, 'stat').and.returnValue(Promise.resolve(mockContentStat));

      const mockFetchContentFunction = async () => {
        return {
          code: FetchResultCode.Success,
          content: Buffer.from('ipfs')
        };
      };
      spyOn(ipfsStorage as any, 'fetchContent').and.callFake(mockFetchContentFunction);
      spyOn(ipfsStorage['node'].pin, 'add').and.returnValue(Promise.resolve([true]));

      const expectedErrorCode = FetchResultCode.NotFound;
      const fetchedContent = await ipfsStorage.read('abc123', maxFileSize);
      expect(expectedErrorCode).toEqual(fetchedContent.code);
    });

    it('should return not a file if cat throws an error', async () => {
      const mockContentStat = {
        Hash: 'dummyHahs',
        NumLinks: 0,
        BlockSize: 1,
        LinksSize: 0,
        DataSize: 1024,
        CumulativeSize: 1024
      };
      spyOn(ipfsStorage['node'].object, 'stat').and.returnValue(Promise.resolve(mockContentStat));
      spyOn(ipfsStorage['node'].pin, 'add').and.returnValue(Promise.resolve([true]));
      spyOn(ipfsStorage['node'], 'cat').and.throwError('error thrown by test');

      const expectedErrorCode = FetchResultCode.NotAFile;
      const fetchedContent = await ipfsStorage.read('abc123', maxFileSize);
      expect(expectedErrorCode).toEqual(fetchedContent.code);
    });

    it('should return not found if cat.next throws an AsyncTimeoutError', async () => {
      const mockContentStat = {
        Hash: 'dummyHahs',
        NumLinks: 0,
        BlockSize: 1,
        LinksSize: 0,
        DataSize: 1024,
        CumulativeSize: 1024
      };
      spyOn(ipfsStorage['node'].object, 'stat').and.returnValue(Promise.resolve(mockContentStat));
      spyOn(ipfsStorage['node'].pin, 'add').and.returnValue(Promise.resolve([true]));

      const mockIterable = new MockAsyncIterable();
      mockIterable.next = () => {
        throw new AsyncTimeoutError();
      };

      spyOn(ipfsStorage['node'], 'cat').and.returnValue(mockIterable);

      const expectedErrorCode = FetchResultCode.NotFound;
      const fetchedContent = await ipfsStorage.read('abc123', maxFileSize);
      expect(expectedErrorCode).toEqual(fetchedContent.code);
    });

    it('should throw unexpected error if cat.next throws an unexpected error', async () => {
      const mockContentStat = {
        Hash: 'dummyHahs',
        NumLinks: 0,
        BlockSize: 1,
        LinksSize: 0,
        DataSize: 1024,
        CumulativeSize: 1024
      };
      spyOn(ipfsStorage['node'].object, 'stat').and.returnValue(Promise.resolve(mockContentStat));
      spyOn(ipfsStorage['node'].pin, 'add').and.returnValue(Promise.resolve([true]));

      const mockIterable = new MockAsyncIterable();
      mockIterable.next = () => {
        throw new Error('A test error thrown by unit test');
      };

      spyOn(ipfsStorage['node'], 'cat').and.returnValue(mockIterable);
      try {
        await ipfsStorage.read('abc123', maxFileSize);
        fail('expect test to throw error but did not');
      } catch (e) {
        expect(e.message).toEqual('A test error thrown by unit test');
      }
    });

    it('should return size exceeded if content size exceeds maxFileSize during download.', async () => {
      const mockContentStat = {
        Hash: 'dummyHahs',
        NumLinks: 0,
        BlockSize: 1,
        LinksSize: 0,
        DataSize: 1024,
        CumulativeSize: 1024
      };
      spyOn(ipfsStorage['node'].object, 'stat').and.returnValue(Promise.resolve(mockContentStat));
      spyOn(ipfsStorage['node'].pin, 'add').and.returnValue(Promise.resolve([true]));

      // this creates a buffer with size 1 bigger than max allowed
      const mockCatValue = randomBytes(maxFileSize + 1);

      spyOn(ipfsStorage['node'], 'cat').and.returnValue(new MockAsyncIterable(mockCatValue, mockCatValue));

      const expectedErrorCode = FetchResultCode.MaxSizeExceeded;
      const fetchedContent = await ipfsStorage.read('abc123', maxFileSize);
      expect(expectedErrorCode).toEqual(fetchedContent.code);
    });

    it('should return not found if cat next result is undefined', async () => {
      const mockContentStat = {
        Hash: 'dummyHahs',
        NumLinks: 0,
        BlockSize: 1,
        LinksSize: 0,
        DataSize: 1024,
        CumulativeSize: 1024
      };
      spyOn(ipfsStorage['node'].object, 'stat').and.returnValue(Promise.resolve(mockContentStat));
      spyOn(ipfsStorage['node'].pin, 'add').and.returnValue(Promise.resolve([true]));

      // this creates a buffer with size 1 bigger than max allowed
      const mockCatValue = randomBytes(maxFileSize);
      const mockIterator = new MockAsyncIterable(mockCatValue, mockCatValue);
      spyOn(ipfsStorage['node'], 'cat').and.returnValue(mockIterator);
      spyOn(AsyncExecutor, 'executeWithTimeout')
      .and.returnValues(Promise.resolve({ result: mockContentStat, timedOut: true }), Promise.resolve({ result: undefined, timedOut: true }));

      const expectedErrorCode = FetchResultCode.NotFound;
      const fetchedContent = await ipfsStorage.read('abc123', maxFileSize);
      expect(expectedErrorCode).toEqual(fetchedContent.code);
    });
  });

  describe('write', () => {
    it('should write the content to IPFS and return the multihash.', async () => {
      const expectedHash = 'Qm12345abc';
      const mockSidetreeContent = {
        path: 'path.txt',
        cid: Buffer.from(expectedHash),
        size: 5493356,
        mode: 420,
        mtime: undefined
      };

      const mockAdd = (_data: IPFS.FileContent, _options?: any) => {
        return new MockAsyncIterable(mockSidetreeContent, mockSidetreeContent);
      };

      spyOn(ipfsStorage['node'], 'add').and.callFake(mockAdd);

      const bufferContent = Buffer.from('ipfs');

      const fetchedHash = await ipfsStorage.write(bufferContent);
      expect(expectedHash).toEqual(fetchedHash);
    });
  });

  describe('stop', () => {
    it('should call node stop', async () => {
      const stopSpy = spyOn(ipfsStorage['node'], 'stop').and.returnValue(Promise.resolve(undefined));
      await ipfsStorage.stop();
      expect(stopSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('getSingleton', () => {
    it('should throw error if instance does not exist', () => {
      const ipfsStorageHolder = IpfsStorage['ipfsStorageSingleton'];
      // set it to undefined for now so get will throw error (mocking as undefined)
      IpfsStorage['ipfsStorageSingleton'] = undefined;

      try {
        IpfsStorage.getSingleton();
      } catch (error) {
        expect(error.message).toEqual('ipfs_get_before_create: IpfsStorage is a singleton, Please use the createSingleton method before get');
      }

      // reset the mocking
      IpfsStorage['ipfsStorageSingleton'] = ipfsStorageHolder;
    });
  });
});

import * as IPFS from 'ipfs';
import FetchResultCode from '../../lib/common/FetchResultCode';
import IpfsStorage from '../../lib/ipfs/IpfsStorage';
import MockAsyncIterable from '../mocks/MockAsyncIterable';

describe('IpfsStorage', () => {
  let ipfsStorage: IpfsStorage;
  const maxFileSize = 20000000; // 20MB

  beforeEach(async () => {
    ipfsStorage = await IpfsStorage.create();
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
      spyOn(ipfsStorage['node'].object, 'stat').and.throwError('error thrown by test');

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

      const mockCatValue = Buffer.from('some kind of string value');
      spyOn(ipfsStorage['node'], 'cat').and.returnValue(new MockAsyncIterable(mockCatValue, mockCatValue));

      const expectedErrorCode = FetchResultCode.MaxSizeExceeded;
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
    it('should call node stop', () => {
      const stopSpy = spyOn(ipfsStorage['node'], 'stop').and.returnValue(undefined);
      ipfsStorage.stop();
      expect(stopSpy).toHaveBeenCalledTimes(1);
    });
  });
});

import FetchResultCode from '../../lib/common/enums/FetchResultCode';
import IpfsStorage from '../../lib/ipfs/IpfsStorage';
import MockAsyncIterable from '../mocks/MockAsyncIterable';
// import { randomBytes } from 'crypto';

describe('IpfsStorage', () => {
  let ipfsStorage: IpfsStorage;
  let maxFileSize: number;

  beforeAll(async () => {

    ipfsStorage = new IpfsStorage();

    // ipfsStorage.initialize();
    // ipfsStorage['node'] = nodeMock;

    maxFileSize = 20000000; // 20MB
  });

  describe('read', () => {
    it('should return the pinned content for the given hash.', async () => {
      const mockContent = Buffer.from('ipfs');
      // spyOn(ipfsStorage['node']!.pin, 'add').and.returnValue(Promise.resolve([true]));
      // spyOn(ipfsStorage['node']!, 'cat').and.returnValue(new MockAsyncIterable(mockContent, mockContent, 1));

      const expectedContent = mockContent;

      const fetchedContent = await ipfsStorage.read('abc123', maxFileSize);
      expect(expectedContent).toEqual(fetchedContent.content!);
    });

    it('should return not a file if cat throws is a directory error', async () => {
      // spyOn(ipfsStorage['node']!.pin, 'add').and.returnValue(Promise.resolve([true]));
      // spyOn(ipfsStorage['node']!, 'cat').and.throwError('this dag node is a directory');

      const expectedErrorCode = FetchResultCode.NotAFile;
      const fetchedContent = await ipfsStorage.read('abc123', maxFileSize);
      expect(expectedErrorCode).toEqual(fetchedContent.code);
    });

    it('should return not a file if cat throws no content error', async () => {
      // spyOn(ipfsStorage['node']!.pin, 'add').and.returnValue(Promise.resolve([true]));
      // spyOn(ipfsStorage['node']!, 'cat').and.throwError('this dag node has no content');

      const expectedErrorCode = FetchResultCode.NotAFile;
      const fetchedContent = await ipfsStorage.read('abc123', maxFileSize);
      expect(expectedErrorCode).toEqual(fetchedContent.code);
    });

    it('should return not found for any other unexpected error', async () => {
      // spyOn(ipfsStorage['node']!.pin, 'add').and.returnValue(Promise.resolve([true]));
      // spyOn(ipfsStorage['node']!, 'cat').and.throwError('some unexpected error');

      const expectedErrorCode = FetchResultCode.NotFound;
      const fetchedContent = await ipfsStorage.read('abc123', maxFileSize);
      expect(expectedErrorCode).toEqual(fetchedContent.code);
    });

    it('should return error code when cat.next throws an unexpected error', async () => {
      // spyOn(ipfsStorage['node']!.pin, 'add').and.returnValue(Promise.resolve([true]));

      const mockIterable = new MockAsyncIterable();
      mockIterable.next = () => {
        throw new Error('A test error thrown by unit test');
      };

      // spyOn(ipfsStorage['node']!, 'cat').and.returnValue(mockIterable);
      const result = await ipfsStorage.read('abc123', maxFileSize);
      expect(result).toEqual({ code: FetchResultCode.CasNotReachable });
    });

    it('should return size exceeded if content size exceeds maxFileSize during download.', async () => {
      // spyOn(ipfsStorage['node']!.pin, 'add').and.returnValue(Promise.resolve([true]));

      // // this creates a buffer with size 1 bigger than max allowed
      // const mockCatValue = randomBytes(maxFileSize + 1);

      // spyOn(ipfsStorage['node']!, 'cat').and.returnValue(new MockAsyncIterable(mockCatValue, mockCatValue));

      const expectedErrorCode = FetchResultCode.MaxSizeExceeded;
      const fetchedContent = await ipfsStorage.read('abc123', maxFileSize);
      expect(expectedErrorCode).toEqual(fetchedContent.code);
    });

    it('should return not found if cat next result is undefined', async () => {
      // spyOn(ipfsStorage['node']!.pin, 'add').and.returnValue(Promise.resolve([true]));

      // const mockIterator = new MockAsyncIterable(undefined, undefined);
      // spyOn(ipfsStorage['node']!, 'cat').and.returnValue(mockIterator);

      const expectedErrorCode = FetchResultCode.NotFound;
      const fetchedContent = await ipfsStorage.read('abc123', maxFileSize);
      expect(expectedErrorCode).toEqual(fetchedContent.code);
    });
  });

  describe('write', () => {
    it('should write the content to IPFS and return the multihash.', async () => {
      const expectedHash = 'Qm12345abc';
      // const mockSidetreeContent = {
      //   path: 'path.txt',
      //   cid: Buffer.from(expectedHash),
      //   size: 5493356,
      //   mode: 420,
      //   mtime: undefined
      // };

      // const mockAdd = (_data: IPFS.FileContent, _options?: any) => {
      //   return new MockAsyncIterable(mockSidetreeContent, mockSidetreeContent);
      // };

      // spyOn(ipfsStorage['node']!, 'add').and.callFake(mockAdd);

      const bufferContent = Buffer.from('ipfs');

      const fetchedHash = await ipfsStorage.write(bufferContent);
      expect(expectedHash).toEqual(fetchedHash!);
    });
  });
});

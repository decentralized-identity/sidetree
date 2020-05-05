import * as IPFS from 'ipfs';
import FetchResultCode from '../../lib/common/enums/FetchResultCode';
import IpfsStorage from '../../lib/ipfs/IpfsStorage';
import MockAsyncIterable from '../mocks/MockAsyncIterable';
import { randomBytes } from 'crypto';

describe('IpfsStorage', () => {
  let ipfsStorage: IpfsStorage;
  let maxFileSize: number;
  let createSpy: any;
  let nodeMock: any;

  beforeAll(async () => {

    ipfsStorage = new IpfsStorage();
    nodeMock = {
      add: () => { return; },
      cat: () => { return; },
      pin: {
        add: () => { return; }
      },
      stop: () => { return; }
    } as any;

    createSpy = spyOn(IPFS, 'create').and.returnValue(nodeMock);
    // ipfsStorage.initialize();
    ipfsStorage['node'] = nodeMock;

    maxFileSize = 20000000; // 20MB
  });

  describe('read', () => {
    it('should return the pinned content for the given hash.', async () => {
      const mockContent = Buffer.from('ipfs');
      spyOn(ipfsStorage['node']!.pin, 'add').and.returnValue(Promise.resolve([true]));
      spyOn(ipfsStorage['node']!, 'cat').and.returnValue(new MockAsyncIterable(mockContent, mockContent, 1));

      const expectedContent = mockContent;

      const fetchedContent = await ipfsStorage.read('abc123', maxFileSize);
      expect(expectedContent).toEqual(fetchedContent.content!);
    });

    it('should return not a file if cat throws is a directory error', async () => {
      spyOn(ipfsStorage['node']!.pin, 'add').and.returnValue(Promise.resolve([true]));
      spyOn(ipfsStorage['node']!, 'cat').and.throwError('this dag node is a directory');

      const expectedErrorCode = FetchResultCode.NotAFile;
      const fetchedContent = await ipfsStorage.read('abc123', maxFileSize);
      expect(expectedErrorCode).toEqual(fetchedContent.code);
    });

    it('should return not a file if cat throws no content error', async () => {
      spyOn(ipfsStorage['node']!.pin, 'add').and.returnValue(Promise.resolve([true]));
      spyOn(ipfsStorage['node']!, 'cat').and.throwError('this dag node has no content');

      const expectedErrorCode = FetchResultCode.NotAFile;
      const fetchedContent = await ipfsStorage.read('abc123', maxFileSize);
      expect(expectedErrorCode).toEqual(fetchedContent.code);
    });

    it('should return not found for any other unexpected error', async () => {
      spyOn(ipfsStorage['node']!.pin, 'add').and.returnValue(Promise.resolve([true]));
      spyOn(ipfsStorage['node']!, 'cat').and.throwError('some unexpected error');

      const expectedErrorCode = FetchResultCode.NotFound;
      const fetchedContent = await ipfsStorage.read('abc123', maxFileSize);
      expect(expectedErrorCode).toEqual(fetchedContent.code);
    });

    it('should return error code when cat.next throws an unexpected error', async () => {
      spyOn(ipfsStorage['node']!.pin, 'add').and.returnValue(Promise.resolve([true]));

      const mockIterable = new MockAsyncIterable();
      mockIterable.next = () => {
        throw new Error('A test error thrown by unit test');
      };

      spyOn(ipfsStorage['node']!, 'cat').and.returnValue(mockIterable);
      const result = await ipfsStorage.read('abc123', maxFileSize);
      expect(result).toEqual({ code: FetchResultCode.CasNotReachable });
    });

    it('should return size exceeded if content size exceeds maxFileSize during download.', async () => {
      spyOn(ipfsStorage['node']!.pin, 'add').and.returnValue(Promise.resolve([true]));

      // this creates a buffer with size 1 bigger than max allowed
      const mockCatValue = randomBytes(maxFileSize + 1);

      spyOn(ipfsStorage['node']!, 'cat').and.returnValue(new MockAsyncIterable(mockCatValue, mockCatValue));

      const expectedErrorCode = FetchResultCode.MaxSizeExceeded;
      const fetchedContent = await ipfsStorage.read('abc123', maxFileSize);
      expect(expectedErrorCode).toEqual(fetchedContent.code);
    });

    it('should return not found if cat next result is undefined', async () => {
      spyOn(ipfsStorage['node']!.pin, 'add').and.returnValue(Promise.resolve([true]));

      const mockIterator = new MockAsyncIterable(undefined, undefined);
      spyOn(ipfsStorage['node']!, 'cat').and.returnValue(mockIterator);

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

      spyOn(ipfsStorage['node']!, 'add').and.callFake(mockAdd);

      const bufferContent = Buffer.from('ipfs');

      const fetchedHash = await ipfsStorage.write(bufferContent);
      expect(expectedHash).toEqual(fetchedHash!);
    });

    it('should set healthy to false and return undefined if an error is thrown', async () => {
      spyOn(ipfsStorage['node']!, 'add').and.throwError('test error');

      const bufferContent = Buffer.from('ipfs');

      const fetchedHash = await ipfsStorage.write(bufferContent);
      expect(fetchedHash).toEqual(undefined);
      expect(ipfsStorage['healthy']).toEqual(false);
    });
  });

  describe('stop', () => {
    it('should call node stop', async () => {
      const stopSpy = spyOn(ipfsStorage['node']!, 'stop').and.returnValue(Promise.resolve(undefined));
      await ipfsStorage.stop();
      expect(stopSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('getNode', () => {
    it('should get node with default repo if not argument supplied', async () => {
      const result = await ipfsStorage['getNode']();
      expect(createSpy).toHaveBeenCalledWith({ repo: 'sidetree-ipfs' });
      expect(result).toEqual(nodeMock);
    });

    it('should get node with passed in repo if argument supplied', async () => {
      const repoHolder = ipfsStorage['repo'];
      ipfsStorage['repo'] = 'something';
      const result = await ipfsStorage['getNode']();
      expect(createSpy).toHaveBeenCalledWith({ repo: 'something' });
      expect(result).toEqual(nodeMock);
      ipfsStorage['repo'] = repoHolder;
    });
  });

  describe('restart', () => {
    it('should restart the ipfs node and continue to be functional', async () => {
      const stopSpy = spyOn(ipfsStorage['node']!, 'stop');
      const getNodeSpy = spyOn(ipfsStorage as any, 'getNode');
      await ipfsStorage['restart']();
      expect(stopSpy).toHaveBeenCalled();
      expect(getNodeSpy).toHaveBeenCalled();
    });
  });

  describe('healthCheck', () => {
    it('should not restart if is healthy', async () => {
      ipfsStorage['healthy'] = true;
      const restartSpy = spyOn(ipfsStorage as any, 'restart');
      await ipfsStorage['healthCheck']();
      expect(restartSpy).toHaveBeenCalledTimes(0);
    });

    it('should call restart if is not healthy', async () => {
      const restartSpy = spyOn(ipfsStorage as any, 'restart').and.callFake(async () => { console.log('fake message from test'); });
      ipfsStorage['healthCheckInternalInSeconds'] = 0;
      ipfsStorage['healthy'] = false;
      await ipfsStorage['healthCheck']();
      expect(restartSpy).toHaveBeenCalledTimes(1);
      expect(ipfsStorage['healthy']).toEqual(true);
    });

    it('should go into the next loop even if an error is thrown', async () => {
      const restartSpy = spyOn(ipfsStorage as any, 'restart').and.throwError('error thrown by test');
      ipfsStorage['healthCheckInternalInSeconds'] = 0;
      ipfsStorage['healthy'] = false;
      await ipfsStorage['healthCheck']();
      expect(restartSpy).toHaveBeenCalled();
      expect(ipfsStorage['healthy']).toEqual(false);
    });
  });
});

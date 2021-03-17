import BatchWriter from '../../lib/core/versions/latest/BatchWriter';
import ChunkFile from '../../lib/core/versions/latest/ChunkFile';
import CoreIndexFile from '../../lib/core/versions/latest/CoreIndexFile';
import IBlockchain from '../../lib/core/interfaces/IBlockchain';
import ICas from '../../lib/core/interfaces/ICas';
import IOperationQueue from '../../lib/core/versions/latest/interfaces/IOperationQueue';
import MockBlockchain from '../mocks/MockBlockchain';
import MockCas from '../mocks/MockCas';
import MockOperationQueue from '../mocks/MockOperationQueue';
import OperationGenerator from '../generators/OperationGenerator';
import ProtocolParameters from '../../lib/core/versions/latest/ProtocolParameters';
import ValueTimeLockModel from '../../lib/common/models/ValueTimeLockModel';
import ValueTimeLockVerifier from '../../lib/core/versions/latest/ValueTimeLockVerifier';

describe('BatchWriter', () => {
  let blockchain: IBlockchain;
  let cas: ICas;
  let operationQueue: IOperationQueue;
  let batchWriter: BatchWriter;

  beforeAll(() => {
    blockchain = new MockBlockchain();
    cas = new MockCas();
    operationQueue = new MockOperationQueue();
    const mockVersionMetadataFetcher: any = {};
    batchWriter = new BatchWriter(operationQueue, blockchain, cas, mockVersionMetadataFetcher);
  });

  describe('write()', () => {

    it('should return without writing anything if operation queue is empty.', async (done) => {
      const mockOpsByLock = ProtocolParameters.maxOperationsPerBatch;
      spyOn(blockchain, 'getFee').and.returnValue(Promise.resolve(100)); // Any fee, unused.
      spyOn(blockchain, 'getWriterValueTimeLock').and.returnValue(Promise.resolve(undefined)); // Any value, unused.
      spyOn(BatchWriter, 'getNumberOfOperationsAllowed').and.returnValue(mockOpsByLock);

      const chunkFileCreateBufferSpy = spyOn(ChunkFile, 'createBuffer');
      const casWriteSpy = spyOn(cas, 'write');
      const blockchainWriteSpy = spyOn(blockchain, 'write');

      await batchWriter.write();

      expect(chunkFileCreateBufferSpy).not.toHaveBeenCalled();
      expect(casWriteSpy).not.toHaveBeenCalled();
      expect(blockchainWriteSpy).not.toHaveBeenCalled();

      done();
    });

    it('should pass the writer lock ID to CoreIndexFile.createBuffer() if a value lock exists.', async (done) => {
      spyOn(blockchain, 'getFee').and.returnValue(Promise.resolve(100));

      // Simulate a value lock fetched.
      const valueLock: ValueTimeLockModel = {
        amountLocked: 1,
        identifier: 'anIdentifier',
        lockTransactionTime: 2,
        normalizedFee: 3,
        owner: 'unusedOwner',
        unlockTransactionTime: 4
      };
      spyOn(blockchain, 'getWriterValueTimeLock').and.returnValue(Promise.resolve(valueLock));

      const mockOpsByLock = ProtocolParameters.maxOperationsPerBatch;
      spyOn(BatchWriter, 'getNumberOfOperationsAllowed').and.returnValue(mockOpsByLock);

      // Simulate any operation in queue.
      const createOperationData = await OperationGenerator.generateCreateOperation();
      await operationQueue.enqueue(createOperationData.createOperation.didUniqueSuffix, createOperationData.createOperation.operationBuffer);

      const coreIndexFileCreateBufferSpy = spyOn(CoreIndexFile, 'createBuffer');
      coreIndexFileCreateBufferSpy.and.callFake(async (lockId) => {
        // This is the check for the test.
        expect(lockId).toEqual(valueLock.identifier);
        return Buffer.from('anyCoreIndexFileBuffer');
      });

      await batchWriter.write();

      done();
    });
  });

  describe('createAndWriteProvisionalIndexFileIfNeeded()', () => {
    it('should return `undefined` if no chunk file URI is given.', async () => {
      const chunkFileUri = undefined;
      const provisionalProofFileUri = OperationGenerator.generateRandomHash();
      const updateOperations: any[] = [];
      const provisionalIndexFileUri =
        await (batchWriter as any).createAndWriteProvisionalIndexFileIfNeeded(chunkFileUri, provisionalProofFileUri, updateOperations);
      expect(provisionalIndexFileUri).toBeUndefined();
    });
  });

  describe('createAndWriteChunkFileIfNeeded()', () => {
    it('should return `undefined` if no operation is passed in.', async () => {
      const chunkFileUri = await (batchWriter as any).createAndWriteChunkFileIfNeeded([], [], []);
      expect(chunkFileUri).toBeUndefined();
    });
  });

  describe('getNumberOfOperationsAllowed', () => {

    it('should return the value from the lock verifier', () => {
      const mockOpsByLock = ProtocolParameters.maxOperationsPerBatch - 1;
      spyOn(ValueTimeLockVerifier, 'calculateMaxNumberOfOperationsAllowed').and.returnValue(mockOpsByLock);

      const unusedVersionMetadataFetcher = { } as any;
      const actual = BatchWriter.getNumberOfOperationsAllowed(unusedVersionMetadataFetcher, undefined);
      expect(actual).toEqual(mockOpsByLock);
    });

    it('should not return a value more than the max allowed batch size.', () => {
      const mockOpsByLock = ProtocolParameters.maxOperationsPerBatch + 123;
      spyOn(ValueTimeLockVerifier, 'calculateMaxNumberOfOperationsAllowed').and.returnValue(mockOpsByLock);

      const unusedVersionMetadataFetcher = { } as any;
      const actual = BatchWriter.getNumberOfOperationsAllowed(unusedVersionMetadataFetcher, undefined);
      expect(actual).toEqual(ProtocolParameters.maxOperationsPerBatch);
    });

  });
});

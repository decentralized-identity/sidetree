import AnchorFile from '../../lib/core/versions/latest/AnchorFile';
import BatchWriter from '../../lib/core/versions/latest/BatchWriter';
import ChunkFile from '../../lib/core/versions/latest/ChunkFile';
import IBlockchain from '../../lib/core/interfaces/IBlockchain';
import ICas from '../../lib/core/interfaces/ICas';
import IOperationQueue from '../../lib/core/versions/0.8.0/interfaces/IOperationQueue';
import MockBlockchain from '../mocks/MockBlockchain';
import MockCas from '../mocks/MockCas';
import MockOperationQueue from '../mocks/MockOperationQueue';
import ProtocolParameters from '../../lib/core/versions/latest/ProtocolParameters';
import ValueTimeLockModel from '../../lib/common/models/ValueTimeLockModel';
import ValueTimeLockVerifier from '../../lib/core/versions/latest/ValueTimeLockVerifier';
import OperationGenerator from '../generators/OperationGenerator';

describe('BatchWriter', () => {
  let blockchain: IBlockchain;
  let cas: ICas;
  let operationQueue: IOperationQueue;
  let batchWriter: BatchWriter;

  beforeAll(() => {
    blockchain = new MockBlockchain();
    cas = new MockCas();
    operationQueue = new MockOperationQueue();
    batchWriter = new BatchWriter(operationQueue, blockchain, cas);
  });

  describe('write()', () => {

    it('should return without writing anything if operation queue is emtpy.', async (done) => {
      const mockOpsByLock = ProtocolParameters.maxOperationsPerBatch;
      spyOn(blockchain, 'getFee').and.returnValue(Promise.resolve(100)); // Any fee, unused.
      spyOn(blockchain, 'getWriterValueTimeLock').and.returnValue(Promise.resolve(undefined)); // Any value, unused.
      spyOn(batchWriter as any, 'getNumberOfOperationsAllowed').and.returnValue(mockOpsByLock);

      const chunkFileCreateBufferSpy = spyOn(ChunkFile, 'createBuffer');
      const casWriteSpy = spyOn(cas, 'write');
      const blockchainWriteSpy = spyOn(blockchain, 'write');

      await batchWriter.write();

      expect(chunkFileCreateBufferSpy).not.toHaveBeenCalled();
      expect(casWriteSpy).not.toHaveBeenCalled();
      expect(blockchainWriteSpy).not.toHaveBeenCalled();

      done();
    });

    it('should pass the writer lock ID to AnchoreFile.createBuffer() if a value lock exists.', async (done) => {
      spyOn(blockchain, 'getFee').and.returnValue(Promise.resolve(100));

      // Simulate a value lock fetched.
      const valueLock: ValueTimeLockModel = {
        amountLocked: 1,
        identifier: 'anIdentifier',
        lockTransactionTime: 2,
        normalizedFee: 3,
        owner: 'unusedOwner',
        unlockTransactionTime: 4
      }
      spyOn(blockchain, 'getWriterValueTimeLock').and.returnValue(Promise.resolve(valueLock));

      const mockOpsByLock = ProtocolParameters.maxOperationsPerBatch;
      spyOn(batchWriter as any, 'getNumberOfOperationsAllowed').and.returnValue(mockOpsByLock);

      // Simulate any operation in queue.
      const createOperationData = await OperationGenerator.generateCreateOperation();
      operationQueue.enqueue(createOperationData.createOperation.didUniqueSuffix, createOperationData.createOperation.operationBuffer);

      const anchorFileCreateBufferSpy = spyOn(AnchorFile, 'createBuffer');
      anchorFileCreateBufferSpy.and.callFake( async (lockId) => {
        // This is the check for the test.
        expect(lockId).toEqual(valueLock.identifier);
        return Buffer.from('anyAnchorFileBuffer');
      });

      await batchWriter.write();

      done();
    });
  });

  describe('getNumberOfOperationsAllowed', () => {

    it('should return the value from the lock verifier', () => {
      const mockOpsByLock = ProtocolParameters.maxOperationsPerBatch - 1;
      spyOn(ValueTimeLockVerifier, 'calculateMaxNumberOfOperationsAllowed').and.returnValue(mockOpsByLock);

      const actual = batchWriter['getNumberOfOperationsAllowed'](undefined);
      expect(actual).toEqual(mockOpsByLock);
    });

    it('should not return a value more than the max allowed batch size.', () => {
      const mockOpsByLock = ProtocolParameters.maxOperationsPerBatch + 123;
      spyOn(ValueTimeLockVerifier, 'calculateMaxNumberOfOperationsAllowed').and.returnValue(mockOpsByLock);

      const actual = batchWriter['getNumberOfOperationsAllowed'](undefined);
      expect(actual).toEqual(ProtocolParameters.maxOperationsPerBatch);
    });

  });
});

import AnchoredDataSerializer from '../../lib/core/versions/latest/AnchoredDataSerializer';
import AnchorFile from '../../lib/core/versions/latest/AnchorFile';
import Cas from '../../lib/core/Cas';
import Compressor from '../../lib/core/versions/latest/util/Compressor';
import DownloadManager from '../../lib/core/DownloadManager';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import FetchResult from '../../lib/common/models/FetchResult';
import FetchResultCode from '../../lib/common/FetchResultCode';
import IBlockchain from '../../lib/core/interfaces/IBlockchain';
import JasmineSidetreeErrorValidator from '../JasmineSidetreeErrorValidator';
import MockBlockchain from '../mocks/MockBlockchain';
import MockOperationStore from '../mocks/MockOperationStore';
import OperationGenerator from '../generators/OperationGenerator';
import TransactionModel from '../../lib/common/models/TransactionModel';
import TransactionProcessor from '../../lib/core/versions/latest/TransactionProcessor';
import ValueTimeLockModel from '../../lib/common/models/ValueTimeLockModel';
import ValueTimeLockVerifier from '../../lib/core/versions/latest/ValueTimeLockVerifier';
import SidetreeError from '../../lib/common/SidetreeError';

describe('TransactionProcessor', () => {
  const config = require('../json/config-test.json');
  let casClient: Cas;
  let operationStore: MockOperationStore;
  let downloadManager: DownloadManager;
  let blockchain: IBlockchain;
  let transactionProcessor: TransactionProcessor;

  beforeEach(() => {
    casClient = new Cas(config.contentAddressableStoreServiceUri);
    operationStore = new MockOperationStore();
    downloadManager = new DownloadManager(config.maxConcurrentDownloads, casClient);
    downloadManager.start();
    blockchain = new MockBlockchain();
    transactionProcessor = new TransactionProcessor(downloadManager, operationStore, blockchain);
  });

  describe('prcoessTransaction', () => {
    it('should ignore error and return true when AnchoredDataSerializer throws a sidetree error', async () => {
      const anchoredData = 'Bad Format';
      const mockTransaction: TransactionModel = {
        transactionNumber: 1,
        transactionTime: 1000000,
        transactionTimeHash: '1000',
        anchorString: anchoredData,
        transactionFeePaid: 1,
        normalizedTransactionFee: 1,
        writer: 'writer'
      };
      const result = await transactionProcessor.processTransaction(mockTransaction);
      expect(result).toBeTruthy();
    });

    it('should ignore error and return true when FeeManager throws a sidetree error', async () => {
      const anchoredData = AnchoredDataSerializer.serialize({ anchorFileHash: '1stTransaction', numberOfOperations: 0 });
      const mockTransaction: TransactionModel = {
        transactionNumber: 1,
        transactionTime: 1000000,
        transactionTimeHash: '1000',
        anchorString: anchoredData,
        transactionFeePaid: 1,
        normalizedTransactionFee: 1,
        writer: 'writer'
      };
      const result = await transactionProcessor.processTransaction(mockTransaction);
      expect(result).toBeTruthy();
    });

    it('should return true if anchor file hash is not valid', async () => {
      spyOn(downloadManager, 'download').and.callFake((): Promise<FetchResult> => {
        const result: FetchResult = { code: FetchResultCode.InvalidHash };
        return new Promise((resolve) => {
          resolve(result);
        });
      });
      const anchoredData = AnchoredDataSerializer.serialize({ anchorFileHash: '1stTransaction', numberOfOperations: 1 });
      const mockTransaction: TransactionModel = {
        transactionNumber: 1,
        transactionTime: 1000000,
        transactionTimeHash: '1000',
        anchorString: anchoredData,
        transactionFeePaid: 999999,
        normalizedTransactionFee: 1,
        writer: 'writer'
      };
      const result = await transactionProcessor.processTransaction(mockTransaction);
      expect(result).toBeTruthy();
    });

    it('should return true if fetch result code is max size exceeded', async () => {
      spyOn(downloadManager, 'download').and.callFake((): Promise<FetchResult> => {
        const result: FetchResult = { code: FetchResultCode.MaxSizeExceeded };
        return new Promise((resolve) => {
          resolve(result);
        });
      });
      const anchoredData = AnchoredDataSerializer.serialize({ anchorFileHash: '1stTransaction', numberOfOperations: 1 });
      const mockTransaction: TransactionModel = {
        transactionNumber: 1,
        transactionTime: 1000000,
        transactionTimeHash: '1000',
        anchorString: anchoredData,
        transactionFeePaid: 999999,
        normalizedTransactionFee: 1,
        writer: 'writer'
      };
      const result = await transactionProcessor.processTransaction(mockTransaction);
      expect(result).toBeTruthy();
    });

    it('should return true if fetch result code is not a file', async () => {
      spyOn(downloadManager, 'download').and.callFake((): Promise<FetchResult> => {
        const result: FetchResult = { code: FetchResultCode.NotAFile };
        return new Promise((resolve) => {
          resolve(result);
        });
      });
      const anchoredData = AnchoredDataSerializer.serialize({ anchorFileHash: '1stTransaction', numberOfOperations: 1 });
      const mockTransaction: TransactionModel = {
        transactionNumber: 1,
        transactionTime: 1000000,
        transactionTimeHash: '1000',
        anchorString: anchoredData,
        transactionFeePaid: 999999,
        normalizedTransactionFee: 1,
        writer: 'writer'
      };
      const result = await transactionProcessor.processTransaction(mockTransaction);
      expect(result).toBeTruthy();
    });

    it('should return true if fetch result code is cas not reachable', async () => {
      spyOn(downloadManager, 'download').and.callFake((): Promise<FetchResult> => {
        const result: FetchResult = { code: FetchResultCode.CasNotReachable };
        return new Promise((resolve) => {
          resolve(result);
        });
      });
      const anchoredData = AnchoredDataSerializer.serialize({ anchorFileHash: '1stTransaction', numberOfOperations: 1 });
      const mockTransaction: TransactionModel = {
        transactionNumber: 1,
        transactionTime: 1000000,
        transactionTimeHash: '1000',
        anchorString: anchoredData,
        transactionFeePaid: 999999,
        normalizedTransactionFee: 1,
        writer: 'writer'
      };
      const result = await transactionProcessor.processTransaction(mockTransaction);
      expect(result).toBeFalsy();
    });

    it('should return true if fetch result code is not found', async () => {
      spyOn(downloadManager, 'download').and.callFake((): Promise<FetchResult> => {
        const result: FetchResult = { code: FetchResultCode.NotFound };
        return new Promise((resolve) => {
          resolve(result);
        });
      });
      const anchoredData = AnchoredDataSerializer.serialize({ anchorFileHash: '1stTransaction', numberOfOperations: 1 });
      const mockTransaction: TransactionModel = {
        transactionNumber: 1,
        transactionTime: 1000000,
        transactionTimeHash: '1000',
        anchorString: anchoredData,
        transactionFeePaid: 999999,
        normalizedTransactionFee: 1,
        writer: 'writer'
      };
      const result = await transactionProcessor.processTransaction(mockTransaction);
      expect(result).toBeFalsy();
    });

    it('should return false to allow retry if unexpected error is thrown', async () => {
      const anchoredData = AnchoredDataSerializer.serialize({ anchorFileHash: '1stTransaction', numberOfOperations: 1 });
      const mockTransaction: TransactionModel = {
        transactionNumber: 1,
        transactionTime: 1000000,
        transactionTimeHash: '1000',
        anchorString: anchoredData,
        transactionFeePaid: 999999,
        normalizedTransactionFee: 1,
        writer: 'writer'
      };

      // Mock a method used by `processTransaction` to throw an error.
      spyOn(AnchoredDataSerializer, 'deserialize').and.throwError('Some unexpected error.');

      const result = await transactionProcessor.processTransaction(mockTransaction);
      expect(result).toBeFalsy();
    });
  });

  describe('downloadAndVerifyAnchorFile', () => {
    it('should throw if paid operation count exceeded the protocol limit.', async (done) => {
      const mockTransaction: TransactionModel = {
        anchorString: 'anchor string',
        normalizedTransactionFee: 123,
        transactionFeePaid: 1234,
        transactionNumber: 98765,
        transactionTime: 5678,
        transactionTimeHash: 'transaction time hash',
        writer: 'writer'
      };

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => transactionProcessor['downloadAndVerifyAnchorFile'](mockTransaction,'mock_hash', 999999), // Some really large paid operation count.
        ErrorCode.TransactionProcessorPaidOperationCountExceedsLimit);

      done();
    });

    it('should throw if operation count in anchor file exceeded the paid limit.', async (done) => {
      const createOperation1 = (await OperationGenerator.generateCreateOperation()).createOperation;
      const createOperation2 = (await OperationGenerator.generateCreateOperation()).createOperation;
      const mockAnchorFileModel = await AnchorFile.createModel(
        'writerlock', 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA', [createOperation1, createOperation2], [], []
      );
      const mockAnchorFileBuffer = await Compressor.compress(Buffer.from(JSON.stringify(mockAnchorFileModel)));

      spyOn(transactionProcessor as any, 'downloadFileFromCas').and.returnValue(Promise.resolve(mockAnchorFileBuffer));

      const mockTransaction: TransactionModel = {
        anchorString: 'anchor string',
        normalizedTransactionFee: 123,
        transactionFeePaid: 1234,
        transactionNumber: 98765,
        transactionTime: 5678,
        transactionTimeHash: 'transaction time hash',
        writer: 'writer'
      };

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => transactionProcessor['downloadAndVerifyAnchorFile'](mockTransaction, 'mock_hash', 1),
        ErrorCode.AnchorFileOperationCountExceededPaidLimit);

      done();
    });

    it('should bubble up any errors thrown by verify lock routine', async (done) => {
      spyOn(transactionProcessor as any, 'downloadFileFromCas').and.returnValue(Promise.resolve(Buffer.from('value')));

      const mockAnchorFile: AnchorFile = {
        createOperations: [],
        didUniqueSuffixes: ['abc', 'def'],
        model: { writerLockId: 'lock', mapFileHash: 'map_hash', operations: {} },
        recoverOperations: [],
        revokeOperations: []
      };
      spyOn(AnchorFile, 'parse').and.returnValue(Promise.resolve(mockAnchorFile));

      const mockValueTimeLock: ValueTimeLockModel = {
        amountLocked: 1234,
        identifier: 'identifier',
        lockTransactionTime: 1234,
        unlockTransactionTime: 7890,
        owner: 'owner'
      };
      spyOn(transactionProcessor['blockchain'], 'getValueTimeLock').and.returnValue(Promise.resolve(mockValueTimeLock));

      const mockTransaction: TransactionModel = {
        anchorString: 'anchor string',
        normalizedTransactionFee: 123,
        transactionFeePaid: 1234,
        transactionNumber: 98765,
        transactionTime: 5678,
        transactionTimeHash: 'transaction time hash',
        writer: 'writer'
      };

      const mockErrorCode = 'some error code';
      spyOn(ValueTimeLockVerifier, 'verifyLockAmountAndThrowOnError').and.callFake(() => {
        throw new SidetreeError(mockErrorCode);
      });

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => transactionProcessor['downloadAndVerifyAnchorFile'](mockTransaction, 'anchor_hash', mockAnchorFile.didUniqueSuffixes.length),
        mockErrorCode);
      done();
    });

    it('should return the parsed file.', async (done) => {
      const createOperationData = await OperationGenerator.generateCreateOperation();
      const mockAnchorFileModel = await AnchorFile.createModel(
        'writerlock', 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA', [createOperationData.createOperation], [], []
      );
      const mockAnchorFileBuffer = await Compressor.compress(Buffer.from(JSON.stringify(mockAnchorFileModel)));

      spyOn(transactionProcessor as any, 'downloadFileFromCas').and.returnValue(Promise.resolve(mockAnchorFileBuffer));
      spyOn(transactionProcessor['blockchain'], 'getValueTimeLock').and.returnValue(Promise.resolve(undefined));
      spyOn(ValueTimeLockVerifier, 'verifyLockAmountAndThrowOnError').and.returnValue(undefined);

      const mockTransaction: TransactionModel = {
        anchorString: 'anchor string',
        normalizedTransactionFee: 123,
        transactionFeePaid: 1234,
        transactionNumber: 98765,
        transactionTime: 5678,
        transactionTimeHash: 'transaction time hash',
        writer: 'writer'
      };

      const paidBatchSize = 2;
      const downloadedAnchorFile = await transactionProcessor['downloadAndVerifyAnchorFile'](mockTransaction, 'mock_hash', paidBatchSize);
      expect(downloadedAnchorFile.model).toEqual(mockAnchorFileModel);
      done();
    });
  });
});

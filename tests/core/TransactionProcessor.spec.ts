import AnchoredDataSerializer from '../../lib/core/versions/latest/AnchoredDataSerializer';
import AnchorFile from '../../lib/core/versions/latest/AnchorFile';
import AnchorFileModel from '../../lib/core/versions/latest/models/AnchorFileModel';
import Cas from '../../lib/core/Cas';
import DownloadManager from '../../lib/core/DownloadManager';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import FetchResult from '../../lib/common/models/FetchResult';
import FetchResultCode from '../../lib/common/FetchResultCode';
import JasmineSidetreeErrorValidator from '../JasmineSidetreeErrorValidator';
import MockOperationStore from '../mocks/MockOperationStore';
import TransactionModel from '../../lib/common/models/TransactionModel';
import TransactionProcessor from '../../lib/core/versions/latest/TransactionProcessor';

describe('TransactionProcessor', () => {
  const config = require('../json/config-test.json');
  let casClient: Cas;
  let operationStore: MockOperationStore;
  let downloadManager: DownloadManager;
  let transactionProcessor: TransactionProcessor;

  beforeEach(() => {
    casClient = new Cas(config.contentAddressableStoreServiceUri);
    operationStore = new MockOperationStore();
    downloadManager = new DownloadManager(config.maxConcurrentDownloads, casClient);
    downloadManager.start();
    transactionProcessor = new TransactionProcessor(downloadManager, operationStore);
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
    it('should throw if the downloaded file has incorrect number of the unique suffixes.', async (done) => {
      spyOn(transactionProcessor as any, 'downloadFileFromCas').and.returnValue(Promise.resolve(Buffer.alloc(0)));

      const mockAnchorFile: AnchorFileModel = {
        writerLock: 'lock identifier',
        didUniqueSuffixes: [ 'suffix 1', 'suffix2' ],
        mapFileHash: 'map_file_hash'
      };
      spyOn(AnchorFile, 'parseAndValidate').and.returnValue(Promise.resolve(mockAnchorFile));

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => transactionProcessor['downloadAndVerifyAnchorFile']('mock_hash', mockAnchorFile.didUniqueSuffixes.length + 5),
        ErrorCode.AnchorFileDidUniqueSuffixesCountIncorrect);

      done();
    });

    it('should return the parsed file.', async (done) => {
      spyOn(transactionProcessor as any, 'downloadFileFromCas').and.returnValue(Promise.resolve(Buffer.alloc(0)));

      const mockAnchorFile: AnchorFileModel = {
        writerLock: 'lock identifier',
        didUniqueSuffixes: [ 'suffix 1', 'suffix2' ],
        mapFileHash: 'map_file_hash'
      };
      spyOn(AnchorFile, 'parseAndValidate').and.returnValue(Promise.resolve(mockAnchorFile));

      const actual = await transactionProcessor['downloadAndVerifyAnchorFile']('mock_hash', mockAnchorFile.didUniqueSuffixes.length);
      expect(actual).toEqual(mockAnchorFile);
      done();
    });
  });
});

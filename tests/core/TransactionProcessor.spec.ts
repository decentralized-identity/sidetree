import TransactionModel from '../../lib/common/models/TransactionModel';
import TransactionProcessor from '../../lib/core/versions/latest/TransactionProcessor';
import MockOperationStore from '../mocks/MockOperationStore';
import DownloadManager from '../../lib/core/DownloadManager';
import Cas from '../../lib/core/Cas';
import AnchoredDataSerializer from '../../lib/core/versions/latest/AnchoredDataSerializer';
import { FetchResultCode } from '../../lib/common/FetchResultCode';
import FetchResult from '../../lib/common/models/FetchResult';

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
        normalizedTransactionFee: 1
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
        normalizedTransactionFee: 1
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
        normalizedTransactionFee: 1
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
        normalizedTransactionFee: 1
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
        normalizedTransactionFee: 1
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
        normalizedTransactionFee: 1
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
        normalizedTransactionFee: 1
      };
      const result = await transactionProcessor.processTransaction(mockTransaction);
      expect(result).toBeFalsy();
    });
  });
});

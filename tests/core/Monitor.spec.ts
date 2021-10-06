import BatchWriter from '../../lib/core/versions/latest/BatchWriter';
import MongoDbTransactionStore from '../../lib/common/MongoDbTransactionStore';
import { SidetreeMonitor } from '../../lib';
import TransactionModel from '../../lib/common/models/TransactionModel';

describe('Monitor', async () => {
  const testConfig = require('../json/config-test.json');

  describe('getOperationQueueSize()', async () => {
    it('should get operation queue size correctly.', async () => {
      const monitor = new SidetreeMonitor(testConfig, { } as any, { } as any);
      const operationQueueInitializeSpy = spyOn((monitor as any).operationQueue, 'initialize');
      const transactionStoreInitializeSpy = spyOn((monitor as any).transactionStore, 'initialize');

      await monitor.initialize();
      expect(operationQueueInitializeSpy).toHaveBeenCalledTimes(1);
      expect(transactionStoreInitializeSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('getOperationQueueSize()', async () => {
    it('should get operation queue size correctly.', async () => {
      const monitor = new SidetreeMonitor(testConfig, { } as any, { } as any);
      spyOn((monitor as any).operationQueue, 'getSize').and.returnValue(Promise.resolve(300));

      const output = await monitor.getOperationQueueSize();
      expect(output).toEqual({ operationQueueSize: 300 });
    });
  });

  describe('getWriterMaxBatchSize()', async () => {
    it('should get writer max batch size correctly.', async () => {
      const monitor = new SidetreeMonitor(testConfig, { } as any, { } as any);
      (monitor as any).blockchain = { getWriterValueTimeLock: () => { } };
      spyOn((monitor as any).blockchain, 'getWriterValueTimeLock');
      spyOn(BatchWriter, 'getNumberOfOperationsAllowed').and.returnValue(1000);

      const output = await monitor.getWriterMaxBatchSize();
      expect(output).toEqual({ writerMaxBatchSize: 1000 });
    });
  });

  describe('getLastTransaction()', async () => {
    it('should get last processed transaction correctly.', async () => {
      const mockTransaction: TransactionModel = {
        anchorString: 'anyAnchor',
        transactionFeePaid: 1,
        transactionNumber: 1,
        transactionTime: 1,
        transactionTimeHash: 'anyHash',
        writer: 'anyWriter',
        normalizedTransactionFee: 1
      };

      const monitor = new SidetreeMonitor(testConfig, { } as any, { } as any);
      spyOn((monitor as any).transactionStore as MongoDbTransactionStore, 'getLastTransaction').and.returnValue(Promise.resolve(mockTransaction));

      const output = await monitor.getLastProcessedTransaction();
      expect(output).toEqual(mockTransaction);
    });
  });
});

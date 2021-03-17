import BatchWriter from '../../lib/core/versions/latest/BatchWriter';
import { SidetreeMonitor } from '../../lib';

describe('Monitor', async () => {
  const testConfig = require('../json/config-test.json');

  describe('getOperationQueueSize()', async () => {
    it('should get operation queue size correctly', async () => {
      const monitor = new SidetreeMonitor({ } as any, { } as any);
      spyOn((monitor as any).operationQueue, 'initialize');
      spyOn((monitor as any).operationQueue, 'getSize').and.returnValue(Promise.resolve(300));

      monitor.initialize(testConfig);
      const output = await monitor.getOperationQueueSize();
      expect(output).toEqual({ operationQueueSize: 300 });
    });

    it('should get writer max batch size correctly', async () => {
      const mockBlockchain = { getWriterValueTimeLock: () => { } };
      const monitor = new SidetreeMonitor({ } as any, mockBlockchain as any);
      spyOn((monitor as any).operationQueue, 'initialize');
      spyOn((monitor as any).blockchain, 'getWriterValueTimeLock');
      spyOn(BatchWriter, 'getNumberOfOperationsAllowed').and.returnValue(1000);

      monitor.initialize(testConfig);
      const output = await monitor.getWriterMaxBatchSize();
      expect(output).toEqual({ writerMaxBatchSize: 1000 });
    });
  });
});

import { SidetreeMonitor } from '../../lib';

describe('Monitor', async () => {
  const testConfig = require('../json/config-test.json');

  describe('getOperationQueueSize()', async () => {
    it('should get operation queue size correctly', async () => {
      const monitor = new SidetreeMonitor();
      spyOn((monitor as any).operationQueue, 'initialize');
      spyOn((monitor as any).operationQueue, 'getSize').and.returnValue(Promise.resolve(300));

      monitor.initialize(testConfig);
      const queueSize = await monitor.getOperationQueueSize();
      expect(queueSize).toEqual(300);
    });
  });
});

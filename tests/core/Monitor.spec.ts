import { SidetreeMonitor } from '../../lib';

describe('Monitor', async () => {
  const testConfig = require('../json/config-test.json');

  describe('getOperationQueueSize()', async () => {
    it('should get operation queue size correctly', async () => {
      const monitor = new SidetreeMonitor();
      monitor.initialize(testConfig);

      spyOn((monitor as any).operationQueue, 'getSize').and.returnValue(Promise.resolve(300));

      const queueSize = await monitor.getOperationQueueSize();
      expect(queueSize).toEqual(300);
    });
  });
});

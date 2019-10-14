import * as retry from 'async-retry';
import BatchScheduler from '../../lib/core/BatchScheduler';
import MockBatchWriter from '../mocks/MockBatchWriter';
import MockBlockchain from '../mocks/MockBlockchain';
import MockVersionManager from '../mocks/MockVersionManager';

describe('BatchScheduler', async () => {
  it('should periodically invoke batch writer.', async () => {
    const blockchain = new MockBlockchain();
    const batchWriter = new MockBatchWriter();

    const versionManager = new MockVersionManager();
    spyOn(versionManager, 'getBatchWriter').and.returnValue(batchWriter);

    const batchScheduler = new BatchScheduler(versionManager, blockchain, 1);

    batchScheduler.startPeriodicBatchWriting();

    // Monitor the Batch Scheduler until the Batch Writer is invoked or max retries is reached.
    await retry(async _bail => {
      if (batchWriter.invocationCount >= 2) {
        return;
      }

      // NOTE: if anything throws, we retry.
      throw new Error('Batch writer not invoked.');
    }, {
      retries: 5,
      minTimeout: 1000, // milliseconds
      maxTimeout: 1000 // milliseconds
    });

    batchScheduler.stopPeriodicBatchWriting();

    expect(batchWriter.invocationCount).toBeGreaterThanOrEqual(2);
  });
});

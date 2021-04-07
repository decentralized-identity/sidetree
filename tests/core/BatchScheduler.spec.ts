import * as retry from 'async-retry';
import BatchScheduler from '../../lib/core/BatchScheduler';
import EventCode from '../../lib/core/EventCode';
import EventEmitter from '../../lib/common/EventEmitter';
import MockBatchWriter from '../mocks/MockBatchWriter';
import MockBlockchain from '../mocks/MockBlockchain';
import MockVersionManager from '../mocks/MockVersionManager';
import SidetreeError from '../../lib/common/SidetreeError';

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

  it('should emit failure event with specific code if known SidetreeError is thrown.', async () => {
    const blockchain = new MockBlockchain();

    const dummyErrorCode = 'any error code';
    const versionManager = new MockVersionManager();
    spyOn(versionManager, 'getBatchWriter').and.callFake(() => { throw new SidetreeError(dummyErrorCode); });

    const eventEmitterEmitSpy = spyOn(EventEmitter, 'emit');
    const batchScheduler = new BatchScheduler(versionManager, blockchain, 1);

    await batchScheduler.writeOperationBatch();

    expect(eventEmitterEmitSpy).toHaveBeenCalledWith(EventCode.SidetreeBatchWriterLoopFailure, { code: dummyErrorCode });
  });
});

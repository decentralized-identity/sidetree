import IBatchWriter from './interfaces/IBatchWriter';
import timeSpan = require('time-span');
import { Blockchain } from './Blockchain';

/**
 * Class that performs periodic writing of batches of Sidetree operations to CAS and blockchain.
 */
export default class BatchScheduler {
  /**
   * Flag indicating if this Batch Writer is currently processing a batch of operations.
   */
  private processing: boolean = false;

  public constructor (
    private getBatchWriter: (blockchainTime: number) => IBatchWriter,
    private blockchain: Blockchain,
    private batchingIntervalInSeconds: number) {
  }

  /**
   * The function that starts periodically anchoring operation batches to blockchain.
   */
  public startPeriodicBatchWriting () {
    setInterval(async () => this.writeOperationBatch(), this.batchingIntervalInSeconds * 1000);
  }

  /**
   * Processes the operations in the queue.
   */
  public async writeOperationBatch () {
    const endTimer = timeSpan(); // For calcuating time taken to write operations.

    // Wait until the next interval if the Batch Writer is still processing a batch.
    if (this.processing) {
      return;
    }

    try {
      console.info('Start operation batch writing...');
      this.processing = true;

      // Get the correct version of the `BatchWriter`.
      const currentTime = this.blockchain.approximateTime.time;
      const batchWriter = this.getBatchWriter(currentTime);

      await batchWriter.write();
    } catch (error) {
      console.error('Unexpected and unhandled error during batch writing, investigate and fix:');
      console.error(error);
    } finally {
      this.processing = false;

      console.info(`End batch writing. Duration: ${endTimer.rounded()} ms.`);
    }
  }
}

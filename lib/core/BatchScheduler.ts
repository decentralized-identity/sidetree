import IBlockchain from './interfaces/IBlockchain';
import IVersionManager from './interfaces/IVersionManager';
import timeSpan = require('time-span');

/**
 * Class that performs periodic writing of batches of Sidetree operations to CAS and blockchain.
 */
export default class BatchScheduler {
  /**
   * Denotes if the periodic batch writing should continue to occur.
   * Used mainly for test purposes.
   */
  private continuePeriodicBatchWriting = false;

  public constructor (
    private versionManager: IVersionManager,
    private blockchain: IBlockchain,
    private batchingIntervalInSeconds: number) {
  }

  /**
   * The function that starts periodically anchoring operation batches to blockchain.
   */
  public startPeriodicBatchWriting () {
    this.continuePeriodicBatchWriting = true;
    setImmediate(async () => this.writeOperationBatch());
  }

  /**
   * Stops periodic batch writing.
   * Mainly used for test purposes.
   */
  public stopPeriodicBatchWriting () {
    console.info(`Stopped periodic batch writing.`);
    this.continuePeriodicBatchWriting = false;
  }

  /**
   * Processes the operations in the queue.
   */
  public async writeOperationBatch () {
    const endTimer = timeSpan(); // For calculating time taken to write operations.

    try {
      console.info('Start operation batch writing...');

      // Get the correct version of the `BatchWriter`.
      const currentTime = this.blockchain.approximateTime.time;
      const batchWriter = this.versionManager.getBatchWriter(currentTime);

      await batchWriter.write();
    } catch (error) {
      console.error('Unexpected and unhandled error during batch writing, investigate and fix:');
      console.error(error);
    } finally {
      console.info(`End batch writing. Duration: ${endTimer.rounded()} ms.`);

      if (this.continuePeriodicBatchWriting) {
        console.info(`Waiting for ${this.batchingIntervalInSeconds} seconds before writing another batch.`);
        setTimeout(async () => this.writeOperationBatch(), this.batchingIntervalInSeconds * 1000);
      }
    }
  }
}

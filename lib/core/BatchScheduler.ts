import * as timeSpan from 'time-span';
import ErrorCode from './ErrorCode';
import EventCode from './EventCode';
import EventEmitter from '../common/EventEmitter';
import IBlockchain from './interfaces/IBlockchain';
import IVersionManager from './interfaces/IVersionManager';
import Logger from '../common/Logger';
import SidetreeError from '../common/SidetreeError';

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
    Logger.info(`Stopped periodic batch writing.`);
    this.continuePeriodicBatchWriting = false;
  }

  /**
   * Processes the operations in the queue.
   */
  public async writeOperationBatch () {
    const endTimer = timeSpan(); // For calculating time taken to write operations.

    try {
      Logger.info('Start operation batch writing...');

      // Get the correct version of the `BatchWriter`.
      const currentTime = (await this.blockchain.getLatestTime()).time;
      const batchWriter = this.versionManager.getBatchWriter(currentTime);

      const batchSize = await batchWriter.write();

      EventEmitter.emit(EventCode.SidetreeBatchWriterLoopSuccess, { batchSize });
    } catch (error) {
      // Default the error to unexpected error.
      const loopFailureEventData = { code: ErrorCode.BatchSchedulerWriteUnexpectedError };

      // Only overwrite the error code if this is a concrete known error.
      if (error instanceof SidetreeError && error.code !== ErrorCode.BlockchainWriteUnexpectedError) {
        loopFailureEventData.code = error.code;
      } else {
        Logger.error('Unexpected and unhandled error during batch writing, investigate and fix:');
        Logger.error(error);
      }

      EventEmitter.emit(EventCode.SidetreeBatchWriterLoopFailure, loopFailureEventData);
    } finally {
      Logger.info(`End batch writing. Duration: ${endTimer.rounded()} ms.`);

      if (this.continuePeriodicBatchWriting) {
        Logger.info(`Waiting for ${this.batchingIntervalInSeconds} seconds before writing another batch.`);
        setTimeout(async () => this.writeOperationBatch(), this.batchingIntervalInSeconds * 1000);
      }
    }
  }
}

import * as Deque from 'double-ended-queue';
import BatchFile from './BatchFile';
import MerkleTree from './lib/MerkleTree';
import { getProtocol } from './Protocol';
import { Blockchain } from './Blockchain';
import { Cas } from './Cas';
import Logger from './lib/Logger';

/**
 * Class that performs periodic rooting of batches of Sidetree operations.
 */
export default class Rooter {
  private operations: Deque<Buffer> = new Deque<Buffer>();

  /**
   * Flag indicating if the rooter is currently processing a batch of operations.
   */
  private processing: boolean = false;

  public constructor (
    private blockchain: Blockchain,
    private cas: Cas,
    private batchIntervalInSeconds: number) {
  }

  /**
   * Adds the given operation to a queue to be batched and anchored on blockchain.
   */
  public add (operation: Buffer) {
    this.operations.push(operation);
  }

  /**
   * Returns the current operation queue length.
   */
  public getOperationQueueLength (): number {
    return this.operations.length;
  }

  /**
   * The function that starts periodically anchoring operation batches to blockchain.
   */
  public startPeriodicRooting () {
    setInterval(async () => this.rootOperations(), this.batchIntervalInSeconds * 1000);
  }

  /**
   * Processes the operations in the queue.
   */
  public async rootOperations () {
    const startTime = process.hrtime(); // For calcuating time taken to root operations.

    // Wait until the next interval if the rooter is still processing a batch.
    if (this.processing) {
      return;
    }

    try {
      Logger.info('Start batch rooting...');
      this.processing = true;

      // Get the batch of operations to be anchored on the blockchain.
      const batch = await this.getBatch();
      Logger.info('Batch size = ' + batch.length);

      // Do nothing if there is nothing to batch together.
      if (batch.length === 0) {
        return;
      }

      // Combine all operations into a Batch File buffer.
      const batchBuffer = BatchFile.fromOperations(batch).toBuffer();

      // TODO: Compress the batch buffer.

      // Make the 'batch file' available in CAS.
      const batchFileHash = await this.cas.write(batchBuffer);

      // Compute the Merkle root hash.
      const merkleRoot = MerkleTree.create(batch).rootHash;

      // Construct the 'anchor file'.
      const anchorFile = {
        batchFileHash: batchFileHash,
        merkleRoot: merkleRoot
      };

      // Make the 'anchor file' available in CAS.
      const anchorFileJsonBuffer = Buffer.from(JSON.stringify(anchorFile));
      const anchorFileAddress = await this.cas.write(anchorFileJsonBuffer);

      // Anchor the 'anchor file hash' on blockchain.
      await this.blockchain.write(anchorFileAddress);
    } catch (e) {
      Logger.info('TODO: batch rooting error handling not implemented.');
      Logger.info(e);
    } finally {
      this.processing = false;

      const duration = process.hrtime(startTime);
      Logger.info(`End batch rooting. Duration: ${duration[0]} s ${duration[1] / 1000000} ms.`);
    }
  }

  /**
   * Gets a batch of operations to be anchored on the blockchain.
   * If number of pending operations is greater than the Sidetree protocol's maximum allowed number per batch,
   * then the maximum allowed number of operation is returned.
   */
  private async getBatch (): Promise<Buffer[]> {
    // Get the protocol version according to current blockchain time to decide on the batch size limit to enforce.
    const currentTime = await this.blockchain.getLatestTime();
    const protocol = getProtocol(currentTime.time + 1);

    let queueSize = this.operations.length;
    let batchSize = queueSize;

    if (queueSize > protocol.maxOperationsPerBatch) {
      batchSize = protocol.maxOperationsPerBatch;
    }

    const batch = new Array<Buffer>(batchSize);
    let count = 0;
    while (count < batchSize) {
      batch[count] = this.operations.shift()!;
      count++;
    }

    return batch;
  }
}

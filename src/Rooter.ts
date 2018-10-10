import * as Deque from 'double-ended-queue';
import MerkleTree from './lib/MerkleTree';
import Protocol from './Protocol';
import { Blockchain } from './Blockchain';
import { Cas } from './Cas';

/**
 * Class that performs periodic rooting of batches of Sidetree operations.
 */
export default class Rooter {
  private operations: Deque<Buffer> = new Deque<Buffer>();

  /**
   * Flag indicating if the rooter is currently processing a batch of operations.
   */
  private processing: boolean = false;

  public constructor (blockchain: Blockchain, cas: Cas, batchIntervalInSeconds: number) {
    // The function that periodically performs rooting to blockchain.
    setInterval(async () => {
      // Wait until the next interval if the rooter is still processing a batch.
      if (this.processing) {
        return;
      }

      try {
        console.info(Date.now() + ' Start batch processing...');
        this.processing = true;

        // Get the batch of operations to be anchored on the blockchain.
        const batch = this.getBatch();
        console.info(Date.now() + ' Batch size = ' + batch.length);

        // Combine all operations into one JSON buffer.
        const batchBuffer = Buffer.from(JSON.stringify(batch));

        // TODO: Compress the batch buffer.

        // Make the 'batch file' available in CAS.
        const batchFileAddress = await cas.write(batchBuffer);

        // Compute the Merkle root hash.
        const merkleRoot = MerkleTree.create(batch).rootHash;

        // Construct the 'anchor file'.
        const anchorFile = {
          batchFile: batchFileAddress,
          merkleRoot: merkleRoot
        };

        // Make the 'anchor file' available in CAS.
        const anchorFileJsonBuffer = Buffer.from(JSON.stringify(anchorFile));
        const anchorFileAddress = await cas.write(anchorFileJsonBuffer);

        // Anchor the 'anchor file hash' on blockchain.
        await blockchain.write(anchorFileAddress);
      } catch (e) {
        console.info('TODO: batch rooting error handling not implemented.');
        console.info(e);
      } finally {
        this.processing = false;
        console.info(Date.now() + ' End batch processing.');
      }
    }, batchIntervalInSeconds * 1000);
  }

  /**
   * Adds the given operation to a queue to be batched and anchored on blockchain.
   */
  public add (operation: Buffer) {
    this.operations.push(operation);
  }

  /**
   * Gets a batch of operations to be anchored on the blockchain.
   * If number of pending operations is greater than the Sidetree protocol's maximum allowed number per batch,
   * then the maximum allowed number of operation is returned.
   */
  private getBatch (): Buffer[] {
    let queueSize = this.operations.length;
    let batchSize = queueSize;

    if (queueSize > Protocol.maxOperationsPerBatch) {
      batchSize = Protocol.maxOperationsPerBatch;
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

import * as Deque from 'double-ended-queue';
import BatchFile from './BatchFile';
import Did from './Did';
import Encoder from './Encoder';
import MerkleTree from './util/MerkleTree';
import ProtocolParameters from './ProtocolParameters';
import timeSpan = require('time-span');
import { Blockchain } from './Blockchain';
import { Cas } from './Cas';
import { Operation, OperationType } from './Operation';

/**
 * Class that performs periodic writing of batches of Sidetree operations to CAS and blockchain.
 */
export default class BatchWriter {
  private operations: Deque<Operation> = new Deque<Operation>();

  /**
   * Flag indicating if this Batch Writer is currently processing a batch of operations.
   */
  private processing: boolean = false;

  public constructor (
    private blockchain: Blockchain,
    private cas: Cas,
    private batchingIntervalInSeconds: number) {
  }

  /**
   * Adds the given operation to a queue to be batched and anchored on blockchain.
   */
  public add (operation: Operation) {
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

      // Get the batch of operations to be anchored on the blockchain.
      const batch = await this.getBatch();
      console.info('Batch size = ' + batch.length);

      // Do nothing if there is nothing to batch together.
      if (batch.length === 0) {
        return;
      }

      // Create the batch file buffer from the operation batch.
      const operationBuffers = batch.map(operation => operation.operationBuffer);
      const batchFileBuffer = BatchFile.fromOperationBuffers(operationBuffers);

      // Write the 'batch file' to content addressable store.
      const batchFileHash = await this.cas.write(batchFileBuffer);
      console.info(`Wrote batch file ${batchFileHash} to content addressable store.`);

      // Compute the Merkle root hash.
      const merkleRoot = MerkleTree.create(operationBuffers).rootHash;
      const encodedMerkleRoot = Encoder.encode(merkleRoot);

      // Construct the DID unique suffixes of each operation to be included in the anchor file.
      const didUniqueSuffixes = await this.getDidUniqueSuffixes(batch);

      // Construct the 'anchor file'.
      const anchorFile = {
        batchFileHash: batchFileHash,
        merkleRoot: encodedMerkleRoot,
        didUniqueSuffixes
      };

      // Make the 'anchor file' available in content addressable store.
      const anchorFileJsonBuffer = Buffer.from(JSON.stringify(anchorFile));
      const anchorFileAddress = await this.cas.write(anchorFileJsonBuffer);
      console.info(`Wrote anchor file ${anchorFileAddress} to content addressable store.`);

      // Anchor the 'anchor file hash' on blockchain.
      await this.blockchain.write(anchorFileAddress);
    } catch (error) {
      console.error('Unexpected and unhandled error during batch writing, investigate and fix:');
      console.error(error);
    } finally {
      this.processing = false;

      console.info(`End batch writing. Duration: ${endTimer.rounded()} ms.`);
    }
  }

  /**
   * Gets a batch of operations to be anchored on the blockchain.
   * Validation is performed according to Sidetree protocol to ensure that the batch will be considered valid by observing nodes.
   * Operations that failed validation are discarded.
   * If number of pending operations is greater than the Sidetree protocol's maximum allowed number per batch,
   * then the maximum allowed number of operation is returned.
   */
  private async getBatch (): Promise<Operation[]> {
    const batch = new Array<Operation>();

    // Get the protocol version according to current blockchain time to decide on the batch size limit to enforce.
    const currentTime = await this.blockchain.getLatestTime();
    const protocol = ProtocolParameters.get(currentTime.time);

    // Keep adding operations to the batch until there are no operations left or max batch size is reached.
    let operation = this.operations.shift();
    while (operation !== undefined && batch.length < protocol.maxOperationsPerBatch) {
      batch.push(operation);
      operation = this.operations.shift();
    }

    return batch;
  }

  /**
   * Returns the DID unique suffix of each operation given in the same order.
   */
  private async getDidUniqueSuffixes (operations: Operation[]) {
    const didUniquesuffixes = new Array<string>(operations.length);

    // Get the protocol version according to current blockchain time to decide on hashing algorithm to use for DID unique suffix computation.
    const currentTime = await this.blockchain.getLatestTime();
    const protocol = ProtocolParameters.get(currentTime.time);

    for (let i = 0; i < operations.length; i++) {
      const operation = operations[i];

      if (operation.type === OperationType.Create) {
        didUniquesuffixes[i] = Did.getUniqueSuffixFromEncodeDidDocument(operation.encodedPayload, protocol.hashAlgorithmInMultihashCode);
      } else {
        didUniquesuffixes[i] = operation.didUniqueSuffix!;
      }
    }

    return didUniquesuffixes;
  }
}

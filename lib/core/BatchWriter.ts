import BatchFile from './BatchFile';
import Did from './Did';
import Encoder from './Encoder';
import MerkleTree from './util/MerkleTree';
import Multihash from './Multihash';
import OperationQueue from './OperationQueue';
import ProtocolParameters, { IProtocolParameters } from './ProtocolParameters';
import timeSpan = require('time-span');
import { Blockchain } from './Blockchain';
import { Cas } from './Cas';
import { Operation, OperationType } from './Operation';

/**
 * Class that performs periodic writing of batches of Sidetree operations to CAS and blockchain.
 */
export default class BatchWriter {
  /**
   * Flag indicating if this Batch Writer is currently processing a batch of operations.
   */
  private processing: boolean = false;

  public constructor (
    private blockchain: Blockchain,
    private cas: Cas,
    private batchingIntervalInSeconds: number,
    private operationQueue: OperationQueue) {
  }

  /**
   * Adds the given operation to a queue to be batched and anchored on blockchain.
   */
  public async add (operation: Operation) {
    await this.operationQueue.enqueue(operation.didUniqueSuffix, operation.operationBuffer);
  }

  /**
   * The function that starts periodically anchoring operation batches to blockchain.
   */
  public startPeriodicBatchWriting () {
    setInterval(async () => this.writeOperationBatch(), this.batchingIntervalInSeconds * 1000);
  }

  /**
   * Checks to see if there is already an operation queued for the given DID unique suffix.
   */
  public async hasOperationQueuedFor (didUniqueSuffix: string): Promise<boolean> {
    return this.operationQueue.contains(didUniqueSuffix);
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

    let batchWritingSucceeded = true;
    let batch: Operation[] = [];
    try {
      console.info('Start operation batch writing...');
      this.processing = true;

      // Get the protocol version according to current blockchain time to decide on the batch size limit to enforce.
      const protocolParameters = this.getCurrentProtocolParameters();

      // Get the batch of operations to be anchored on the blockchain.
      const currentTime = this.blockchain.approximateTime;
      const operationBuffers = await this.operationQueue.peek(protocolParameters.maxOperationsPerBatch);
      batch = operationBuffers.map((buffer) => Operation.createUnanchoredOperation(buffer, currentTime.time));
      console.info('Batch size = ' + batch.length);

      // Do nothing if there is nothing to batch together.
      if (batch.length === 0) {
        return;
      }

      // Create the batch file buffer from the operation batch.
      const batchFileBuffer = BatchFile.fromOperationBuffers(operationBuffers);

      // Write the 'batch file' to content addressable store.
      const batchFileHash = await this.cas.write(batchFileBuffer);
      console.info(`Wrote batch file ${batchFileHash} to content addressable store.`);

      // Compute the Merkle root hash.
      const merkleRoot = MerkleTree.create(operationBuffers).rootHash;
      const merkleRootAsMultihash = Multihash.encode(merkleRoot, 18);
      const encodedMerkleRoot = Encoder.encode(merkleRootAsMultihash);

      // Construct the DID unique suffixes of each operation to be included in the anchor file.
      const didUniqueSuffixes = this.getDidUniqueSuffixes(batch);

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
      batchWritingSucceeded = false;
      console.error('Unexpected and unhandled error during batch writing, investigate and fix:');
      console.error(error);
    } finally {
      this.processing = false;

      // Remove written operations from queue if batch writing is successful.
      if (batchWritingSucceeded) {
        await this.operationQueue.dequeue(batch.length);
      }

      console.info(`End batch writing. Duration: ${endTimer.rounded()} ms.`);
    }
  }

  /**
   * Returns the DID unique suffix of each operation given in the same order.
   */
  private getDidUniqueSuffixes (operations: Operation[]): string[] {
    const didUniquesuffixes = new Array<string>(operations.length);

    // Get the protocol version according to current blockchain time to decide on hashing algorithm to use for DID unique suffix computation.
    const protocolParameters = this.getCurrentProtocolParameters();

    for (let i = 0; i < operations.length; i++) {
      const operation = operations[i];

      if (operation.type === OperationType.Create) {
        didUniquesuffixes[i] = Did.getUniqueSuffixFromEncodeDidDocument(operation.encodedPayload, protocolParameters.hashAlgorithmInMultihashCode);
      } else {
        didUniquesuffixes[i] = operation.didUniqueSuffix;
      }
    }

    return didUniquesuffixes;
  }

  private getCurrentProtocolParameters (): IProtocolParameters {
    const currentTime = this.blockchain.approximateTime;
    const protocolParameters = ProtocolParameters.get(currentTime.time);
    return protocolParameters;
  }
}

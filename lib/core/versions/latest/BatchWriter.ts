import BatchFile from './BatchFile';
import BatchWriter from '../../interfaces/BatchWriter';
import Did from '../../Did';
import Encoder from '../../Encoder';
import MerkleTree from '../../util/MerkleTree';
import Multihash from '../../Multihash';
import OperationQueue from '../../interfaces/OperationQueue';
import ProtocolParameters from './ProtocolParameters';
import { Blockchain } from '../../Blockchain';
import { Cas } from '../../Cas';
import { Operation, OperationType } from '../../Operation';

/**
 * The latest implementation of the `TransactionProcessor`.
 */
export default class BatchWriterLatest implements BatchWriter {
  public constructor (
    private operationQueue: OperationQueue,
    private blockchain: Blockchain,
    private cas: Cas,
    private allSupportedHashAlgorithms: number[],
    private getHashAlgorithmInMultihashCode: (blockchainTime: number) => number) { }

  public async write () {
    // Get the batch of operations to be anchored on the blockchain.
    const currentTime = this.blockchain.approximateTime;
    const operationBuffers = await this.operationQueue.peek(ProtocolParameters.maxOperationsPerBatch);
    const batch = operationBuffers.map(
      (buffer) => Operation.createUnanchoredOperation(buffer, this.getHashAlgorithmInMultihashCode, currentTime.time, this.allSupportedHashAlgorithms)
    );
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

    // Remove written operations from queue if batch writing is successful.
    await this.operationQueue.dequeue(batch.length);
  }

  /**
   * Returns the DID unique suffix of each operation given in the same order.
   */
  private getDidUniqueSuffixes (operations: Operation[]): string[] {
    const didUniquesuffixes = new Array<string>(operations.length);
    for (let i = 0; i < operations.length; i++) {
      const operation = operations[i];

      if (operation.type === OperationType.Create) {
        didUniquesuffixes[i] = Did.getUniqueSuffixFromEncodeDidDocument(operation.encodedPayload, ProtocolParameters.hashAlgorithmInMultihashCode);
      } else {
        didUniquesuffixes[i] = operation.didUniqueSuffix;
      }
    }

    return didUniquesuffixes;
  }
}

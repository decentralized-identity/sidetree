import AnchorFile from './AnchorFile';
import AnchorFileModel from './models/AnchorFileModel';
import BatchFile from './BatchFile';
import ICas from '../../interfaces/ICas';
import Encoder from './Encoder';
import IBatchWriter from '../../interfaces/IBatchWriter';
import IBlockchain from '../../interfaces/IBlockchain';
import IOperationQueue from './interfaces/IOperationQueue';
import MerkleTree from './util/MerkleTree';
import Multihash from './Multihash';
import Operation from './Operation';
import ProtocolParameters from './ProtocolParameters';

/**
 * Implementation of the `TransactionProcessor`.
 */
export default class BatchWriter implements IBatchWriter {
  public constructor (
    private operationQueue: IOperationQueue,
    private blockchain: IBlockchain,
    private cas: ICas) { }

  public async write () {
    // Get the batch of operations to be anchored on the blockchain.
    const operationBuffers = await this.operationQueue.peek(ProtocolParameters.maxOperationsPerBatch);

    console.info('Batch size = ' + operationBuffers.length);

    // Do nothing if there is nothing to batch together.
    if (operationBuffers.length === 0) {
      return;
    }

    const batch = operationBuffers.map(
      (buffer) => Operation.create(buffer)
    );

    // Create the batch file buffer from the operation batch.
    const batchFileBuffer = await BatchFile.fromOperationBuffers(operationBuffers);

    // Write the 'batch file' to content addressable store.
    const batchFileHash = await this.cas.write(batchFileBuffer);
    console.info(`Wrote batch file ${batchFileHash} to content addressable store.`);

    // Compute the Merkle root hash.
    const merkleRoot = MerkleTree.create(operationBuffers).rootHash;
    const merkleRootAsMultihash = Multihash.encode(merkleRoot, 18);
    const encodedMerkleRoot = Encoder.encode(merkleRootAsMultihash);

    // Construct the DID unique suffixes of each operation to be included in the anchor file.
    const didUniqueSuffixes = batch.map(operation => operation.didUniqueSuffix);

    // Construct the 'anchor file'.
    const anchorFileModel: AnchorFileModel = {
      batchFileHash: batchFileHash,
      merkleRoot: encodedMerkleRoot,
      didUniqueSuffixes
    };

    // Make the 'anchor file' available in content addressable store.
    const anchorFileJsonBuffer = await AnchorFile.createBufferFromAnchorFileModel(anchorFileModel);
    const anchorFileAddress = await this.cas.write(anchorFileJsonBuffer);
    console.info(`Wrote anchor file ${anchorFileAddress} to content addressable store.`);

    // Anchor the 'anchor file hash' on blockchain.
    await this.blockchain.write(anchorFileAddress);

    // Remove written operations from queue if batch writing is successful.
    await this.operationQueue.dequeue(batch.length);
  }
}

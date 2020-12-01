import AnchoredData from './models/AnchoredData';
import AnchoredDataSerializer from './AnchoredDataSerializer';
import ChunkFile from './ChunkFile';
import CoreIndexFile from './CoreIndexFile';
import CoreProofFile from './CoreProofFile';
import CreateOperation from './CreateOperation';
import DeactivateOperation from './DeactivateOperation';
import FeeManager from './FeeManager';
import IBatchWriter from '../../interfaces/IBatchWriter';
import IBlockchain from '../../interfaces/IBlockchain';
import ICas from '../../interfaces/ICas';
import IOperationQueue from './interfaces/IOperationQueue';
import IVersionMetadataFetcher from '../../interfaces/IVersionMetadataFetcher';
import LogColor from '../../../common/LogColor';
import Operation from './Operation';
import OperationType from '../../enums/OperationType';
import ProtocolParameters from './ProtocolParameters';
import ProvisionalIndexFile from './ProvisionalIndexFile';
import ProvisionalProofFile from './ProvisionalProofFile';
import RecoverOperation from './RecoverOperation';
import UpdateOperation from './UpdateOperation';
import ValueTimeLockModel from '../../../common/models/ValueTimeLockModel';
import ValueTimeLockVerifier from './ValueTimeLockVerifier';

/**
 * Implementation of the `IBatchWriter`.
 */
export default class BatchWriter implements IBatchWriter {
  public constructor (
    private operationQueue: IOperationQueue,
    private blockchain: IBlockchain,
    private cas: ICas,
    private versionMetadataFetcher: IVersionMetadataFetcher) { }

  public async write () {
    const normalizedFee = await this.blockchain.getFee(this.blockchain.approximateTime.time);
    const currentLock = await this.blockchain.getWriterValueTimeLock();
    const numberOfOpsAllowed = this.getNumberOfOperationsAllowed(currentLock);

    // Get the batch of operations to be anchored on the blockchain.
    const queuedOperations = await this.operationQueue.peek(numberOfOpsAllowed);
    const numberOfOperations = queuedOperations.length;

    // Do nothing if there is nothing to batch together.
    if (queuedOperations.length === 0) {
      console.info(`No queued operations to batch.`);
      return;
    }

    console.info(LogColor.lightBlue(`Batch size = ${LogColor.green(numberOfOperations)}`));

    const operationModels = await Promise.all(queuedOperations.map(async (queuedOperation) => Operation.parse(queuedOperation.operationBuffer)));
    const createOperations = operationModels.filter(operation => operation.type === OperationType.Create) as CreateOperation[];
    const recoverOperations = operationModels.filter(operation => operation.type === OperationType.Recover) as RecoverOperation[];
    const updateOperations = operationModels.filter(operation => operation.type === OperationType.Update) as UpdateOperation[];
    const deactivateOperations = operationModels.filter(operation => operation.type === OperationType.Deactivate) as DeactivateOperation[];

    // Write core proof File if needed.
    const coreProofFileBuffer = await CoreProofFile.createBuffer(recoverOperations, deactivateOperations);
    let coreProofFileHash: string | undefined;
    if (coreProofFileBuffer !== undefined) {
      coreProofFileHash = await this.cas.write(coreProofFileBuffer);
    }

    // Write provisional proof File if needed.
    const provisionalProofFileBuffer = await ProvisionalProofFile.createBuffer(updateOperations);
    let provisionalProofFileHash: string | undefined;
    if (provisionalProofFileBuffer !== undefined) {
      provisionalProofFileHash = await this.cas.write(provisionalProofFileBuffer);
    }

    // Create the chunk file buffer from the operation models, then write the chunk file to content addressable store.
    // NOTE: deactivate operations don't have delta.
    const chunkFileBuffer = await ChunkFile.createBuffer(createOperations, recoverOperations, updateOperations);
    const chunkFileHash = await this.cas.write(chunkFileBuffer);
    console.info(LogColor.lightBlue(`Wrote chunk file ${LogColor.green(chunkFileHash)} to content addressable store.`));

    // Write the provisional index file to content addressable store.
    const provisionalIndexFileBuffer = await ProvisionalIndexFile.createBuffer(chunkFileHash, provisionalProofFileHash, updateOperations);
    const provisionalIndexFileHash = await this.cas.write(provisionalIndexFileBuffer);
    console.info(LogColor.lightBlue(`Wrote provisional index file ${LogColor.green(provisionalIndexFileHash)} to content addressable store.`));

    // Write the core index file to content addressable store.
    const writerLockId = currentLock ? currentLock.identifier : undefined;
    const coreIndexFileBuffer = await CoreIndexFile.createBuffer(
      writerLockId,
      provisionalIndexFileHash,
      coreProofFileHash,
      createOperations,
      recoverOperations,
      deactivateOperations
    );
    const coreIndexFileHash = await this.cas.write(coreIndexFileBuffer);
    console.info(LogColor.lightBlue(`Wrote core index file ${LogColor.green(coreIndexFileHash)} to content addressable store.`));

    // Anchor the data to the blockchain
    const dataToBeAnchored: AnchoredData = {
      coreIndexFileHash,
      numberOfOperations
    };

    const stringToWriteToBlockchain = AnchoredDataSerializer.serialize(dataToBeAnchored);
    const fee = FeeManager.computeMinimumTransactionFee(normalizedFee, numberOfOperations);
    console.info(LogColor.lightBlue(`Writing data to blockchain: ${LogColor.green(stringToWriteToBlockchain)} with minimum fee of: ${LogColor.green(fee)}`));

    await this.blockchain.write(stringToWriteToBlockchain, fee);

    // Remove written operations from queue after batch writing has completed successfully.
    await this.operationQueue.dequeue(queuedOperations.length);
  }

  private getNumberOfOperationsAllowed (valueTimeLock: ValueTimeLockModel | undefined): number {
    const maxNumberOfOpsAllowedByProtocol = ProtocolParameters.maxOperationsPerBatch;
    const maxNumberOfOpsAllowedByLock = ValueTimeLockVerifier.calculateMaxNumberOfOperationsAllowed(valueTimeLock, this.versionMetadataFetcher);

    if (maxNumberOfOpsAllowedByLock > maxNumberOfOpsAllowedByProtocol) {
      // eslint-disable-next-line max-len
      console.info(`Maximum number of operations allowed by value time lock: ${maxNumberOfOpsAllowedByLock}; Maximum number of operations allowed by protocol: ${maxNumberOfOpsAllowedByProtocol}`);
    }

    return Math.min(maxNumberOfOpsAllowedByLock, maxNumberOfOpsAllowedByProtocol);
  }
}

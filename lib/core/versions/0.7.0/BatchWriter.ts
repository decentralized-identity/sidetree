import AnchoredData from './models/AnchoredData';
import AnchoredDataSerializer from './AnchoredDataSerializer';
import AnchorFile from './AnchorFile';
import ChunkFile from './ChunkFile';
import CreateOperation from './CreateOperation';
import DeactivateOperation from './DeactivateOperation';
import FeeManager from './FeeManager';
import ICas from '../../interfaces/ICas';
import IBatchWriter from '../../interfaces/IBatchWriter';
import IBlockchain from '../../interfaces/IBlockchain';
import IOperationQueue from './interfaces/IOperationQueue';
import MapFile from './MapFile';
import Operation from './Operation';
import OperationType from '../../enums/OperationType';
import ProtocolParameters from './ProtocolParameters';
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
    private cas: ICas) { }

  public async write () {
    const normalizedFee = await this.blockchain.getFee(this.blockchain.approximateTime.time);
    const currentLock = await this.blockchain.getWriterValueTimeLock();
    const numberOfOpsAllowed = this.getNumberOfOperationsToWrite(currentLock, normalizedFee);

    // Get the batch of operations to be anchored on the blockchain.
    const queuedOperations = await this.operationQueue.peek(numberOfOpsAllowed);
    const numberOfOperations = queuedOperations.length;

    console.info(`Batch size = ${numberOfOperations}`);

    // Do nothing if there is nothing to batch together.
    if (queuedOperations.length === 0) {
      return;
    }

    const operationModels = await Promise.all(queuedOperations.map(async (queuedOperation) => Operation.parse(queuedOperation.operationBuffer)));
    const createOperations = operationModels.filter(operation => operation.type === OperationType.Create) as CreateOperation[];
    const recoverOperations = operationModels.filter(operation => operation.type === OperationType.Recover) as RecoverOperation[];
    const updateOperations = operationModels.filter(operation => operation.type === OperationType.Update) as UpdateOperation[];
    const deactivateOperations = operationModels.filter(operation => operation.type === OperationType.Deactivate) as DeactivateOperation[];

    // Create the chunk file buffer from the operation models.
    // NOTE: deactivate operations don't have delta.
    const chunkFileBuffer = await ChunkFile.createBuffer(createOperations, recoverOperations, updateOperations);

    // Write the chunk file to content addressable store.
    const chunkFileHash = await this.cas.write(chunkFileBuffer);
    console.info(`Wrote chunk file ${chunkFileHash} to content addressable store.`);

    // Write the map file to content addressable store.
    const mapFileBuffer = await MapFile.createBuffer(chunkFileHash, updateOperations);
    const mapFileHash = await this.cas.write(mapFileBuffer);
    console.info(`Wrote map file ${mapFileHash} to content addressable store.`);

    // Write the anchor file to content addressable store.
    const writerLock = currentLock ? currentLock.identifier : undefined;
    const anchorFileBuffer = await AnchorFile.createBuffer(writerLock, mapFileHash, createOperations, recoverOperations, deactivateOperations);
    const anchorFileHash = await this.cas.write(anchorFileBuffer);
    console.info(`Wrote anchor file ${anchorFileHash} to content addressable store.`);

    // Anchor the data to the blockchain
    const dataToBeAnchored: AnchoredData = {
      anchorFileHash,
      numberOfOperations
    };

    const stringToWriteToBlockchain = AnchoredDataSerializer.serialize(dataToBeAnchored);
    const fee = FeeManager.computeMinimumTransactionFee(normalizedFee, numberOfOperations);
    console.info(`Writing data to blockchain: ${stringToWriteToBlockchain} with minimum fee of: ${fee}`);

    await this.blockchain.write(stringToWriteToBlockchain, fee);

    // Remove written operations from queue after batch writing has completed successfully.
    await this.operationQueue.dequeue(queuedOperations.length);
  }

  private getNumberOfOperationsToWrite (valueTimeLock: ValueTimeLockModel | undefined, normalizedFee: number): number {
    const maxNumberOfOpsAllowedByProtocol = ProtocolParameters.maxOperationsPerBatch;
    const maxNumberOfOpsAllowedByLock = ValueTimeLockVerifier.calculateMaxNumberOfOperationsAllowed(valueTimeLock, normalizedFee);

    if (maxNumberOfOpsAllowedByLock > maxNumberOfOpsAllowedByProtocol) {
      // tslint:disable-next-line: max-line-length
      console.info(`Maximum number of operations allowed by value time lock: ${maxNumberOfOpsAllowedByLock}; Maximum number of operations allowed by protocol: ${maxNumberOfOpsAllowedByProtocol}`);
    }

    return Math.min(maxNumberOfOpsAllowedByLock, maxNumberOfOpsAllowedByProtocol);
  }
}

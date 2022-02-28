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
import IConfirmationStore from '../../interfaces/IConfirmationStore';
import IOperationQueue from './interfaces/IOperationQueue';
import IVersionMetadataFetcher from '../../interfaces/IVersionMetadataFetcher';
import LogColor from '../../../common/LogColor';
import Logger from '../../../common/Logger';
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
    private versionMetadataFetcher: IVersionMetadataFetcher,
    private confirmationStore: IConfirmationStore) { }

  public async write (): Promise<number> {
    const currentTime = await this.blockchain.getLatestTime();
    const normalizedFee = await this.blockchain.getFee(currentTime.time);
    const currentLock = await this.blockchain.getWriterValueTimeLock();
    const numberOfOpsAllowed = BatchWriter.getNumberOfOperationsAllowed(this.versionMetadataFetcher, currentLock);

    // Get the batch of operations to be anchored on the blockchain.
    const queuedOperations = await this.operationQueue.peek(numberOfOpsAllowed);
    const numberOfOperations = queuedOperations.length;

    // Do nothing if there is nothing to batch together.
    if (numberOfOperations === 0) {
      Logger.info(`No queued operations to batch.`);
      return 0;
    }

    const lastSubmitted = await this.confirmationStore.getLastSubmitted();
    Logger.info(`Got the last submitted from ConfirmationStore: submitted at ${lastSubmitted?.submittedAt}, confirmed at ${lastSubmitted?.confirmedAt}.`);

    if (lastSubmitted !== undefined &&
        !BatchWriter.hasEnoughConfirmations(lastSubmitted.confirmedAt, currentTime.time)) {
      Logger.info(`Waiting for more confirmations. Confirmed at ${lastSubmitted.confirmedAt}, Current at ${currentTime.time}.`);
      return 0;
    }

    const operationModels = await Promise.all(queuedOperations.map(async (queuedOperation) => Operation.parse(queuedOperation.operationBuffer)));
    const createOperations = operationModels.filter(operation => operation.type === OperationType.Create) as CreateOperation[];
    const recoverOperations = operationModels.filter(operation => operation.type === OperationType.Recover) as RecoverOperation[];
    const updateOperations = operationModels.filter(operation => operation.type === OperationType.Update) as UpdateOperation[];
    const deactivateOperations = operationModels.filter(operation => operation.type === OperationType.Deactivate) as DeactivateOperation[];

    // Write core proof file if needed.
    const coreProofFileBuffer = await CoreProofFile.createBuffer(recoverOperations, deactivateOperations);
    let coreProofFileUri: string | undefined;
    if (coreProofFileBuffer !== undefined) {
      coreProofFileUri = await this.cas.write(coreProofFileBuffer);
    }

    // Write provisional proof file if needed.
    const provisionalProofFileBuffer = await ProvisionalProofFile.createBuffer(updateOperations);
    let provisionalProofFileUri: string | undefined;
    if (provisionalProofFileBuffer !== undefined) {
      provisionalProofFileUri = await this.cas.write(provisionalProofFileBuffer);
    }

    const chunkFileUri = await this.createAndWriteChunkFileIfNeeded(createOperations, recoverOperations, updateOperations);

    const provisionalIndexFileUri = await this.createAndWriteProvisionalIndexFileIfNeeded(chunkFileUri, provisionalProofFileUri, updateOperations);

    // Write the core index file to content addressable store.
    const writerLockId = currentLock ? currentLock.identifier : undefined;
    const coreIndexFileBuffer = await CoreIndexFile.createBuffer(
      writerLockId,
      provisionalIndexFileUri,
      coreProofFileUri,
      createOperations,
      recoverOperations,
      deactivateOperations
    );
    const coreIndexFileUri = await this.cas.write(coreIndexFileBuffer);
    Logger.info(LogColor.lightBlue(`Wrote core index file ${LogColor.green(coreIndexFileUri)} to content addressable store.`));

    // Anchor the data to the blockchain
    const dataToBeAnchored: AnchoredData = {
      coreIndexFileUri,
      numberOfOperations
    };

    const stringToWriteToBlockchain = AnchoredDataSerializer.serialize(dataToBeAnchored);

    const fee = FeeManager.computeMinimumTransactionFee(normalizedFee, numberOfOperations);
    Logger.info(LogColor.lightBlue(`Writing data to blockchain: ${LogColor.green(stringToWriteToBlockchain)} with minimum fee of: ${LogColor.green(fee)}`));

    await this.blockchain.write(stringToWriteToBlockchain, fee);

    Logger.info(`Transaction ${stringToWriteToBlockchain} is submitted at ${currentTime.time}`);
    await this.confirmationStore.submit(stringToWriteToBlockchain, currentTime.time);

    // Remove written operations from queue after batch writing has completed successfully.
    await this.operationQueue.dequeue(numberOfOperations);

    Logger.info(LogColor.lightBlue(`Batch size = ${LogColor.green(numberOfOperations)}`));

    return numberOfOperations;
  }

  /**
   * Create and write chunk file if needed.
   * @returns CAS URI of the chunk file. `undefined` if there is no need to create and write the file.
   */
  private async createAndWriteChunkFileIfNeeded (
    createOperations: CreateOperation[], recoverOperations: RecoverOperation[], updateOperations: UpdateOperation[]
  ): Promise<string | undefined> {
    const chunkFileBuffer = await ChunkFile.createBuffer(createOperations, recoverOperations, updateOperations);
    if (chunkFileBuffer === undefined) {
      return undefined;
    }

    const chunkFileUri = await this.cas.write(chunkFileBuffer);
    Logger.info(LogColor.lightBlue(`Wrote chunk file ${LogColor.green(chunkFileUri)} to content addressable store.`));

    return chunkFileUri;
  }

  /**
   * Create and write provisional index file if needed.
   * @returns  URI of the provisional index file. `undefined` if there is no need to create and write the file.
   */
  private async createAndWriteProvisionalIndexFileIfNeeded (
    chunkFileUri: string | undefined, provisionalProofFileUri: string | undefined, updateOperations: UpdateOperation[]
  ): Promise<string | undefined> {
    // If `chunkFileUri` is `undefined` it means there are only deactivates, and a batch with only deactivates does not reference a provisional index file.
    if (chunkFileUri === undefined) {
      return undefined;
    }

    const provisionalIndexFileBuffer = await ProvisionalIndexFile.createBuffer(chunkFileUri!, provisionalProofFileUri, updateOperations);
    const provisionalIndexFileUri = await this.cas.write(provisionalIndexFileBuffer);
    Logger.info(LogColor.lightBlue(`Wrote provisional index file ${LogColor.green(provisionalIndexFileUri)} to content addressable store.`));

    return provisionalIndexFileUri;
  }

  private static hasEnoughConfirmations (confirmedAt: number | undefined, currentTime: number): boolean {
    const minConfirmationBetweenWrites: number = 6;

    // If not confirmed.
    if (confirmedAt === undefined) {
      return false;
    }

    const numberOfConfirmations = currentTime - confirmedAt + 1;
    if (numberOfConfirmations < minConfirmationBetweenWrites) {
      return false;
    }

    return true;
  }

  /**
   * Gets the maximum number of operations allowed to be written with the given value time lock.
   */
  public static getNumberOfOperationsAllowed (versionMetadataFetcher: IVersionMetadataFetcher, valueTimeLock: ValueTimeLockModel | undefined): number {
    const maxNumberOfOpsAllowedByProtocol = ProtocolParameters.maxOperationsPerBatch;
    const maxNumberOfOpsAllowedByLock = ValueTimeLockVerifier.calculateMaxNumberOfOperationsAllowed(valueTimeLock, versionMetadataFetcher);

    if (maxNumberOfOpsAllowedByLock > maxNumberOfOpsAllowedByProtocol) {
      // eslint-disable-next-line max-len
      Logger.info(`Maximum number of operations allowed by value time lock: ${maxNumberOfOpsAllowedByLock}; Maximum number of operations allowed by protocol: ${maxNumberOfOpsAllowedByProtocol}`);
    }

    return Math.min(maxNumberOfOpsAllowedByLock, maxNumberOfOpsAllowedByProtocol);
  }
}

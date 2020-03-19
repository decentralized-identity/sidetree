import AnchoredDataSerializer from './AnchoredDataSerializer';
import AnchoredOperationModel from '../../models/AnchoredOperationModel';
import AnchorFile from './AnchorFile';
import ArrayMethods from './util/ArrayMethods';
import BatchFile from './BatchFile';
import BatchFileModel from './models/BatchFileModel';
import DownloadManager from '../../DownloadManager';
import ErrorCode from './ErrorCode';
import FeeManager from './FeeManager';
import FetchResultCode from '../../../common/FetchResultCode';
import IBlockchain from '../../interfaces/IBlockchain';
import IOperationStore from '../../interfaces/IOperationStore';
import ITransactionProcessor from '../../interfaces/ITransactionProcessor';
import MapFile from './MapFile';
import MapFileModel from './models/MapFileModel';
import OperationType from '../../enums/OperationType';
import ProtocolParameters from './ProtocolParameters';
import SidetreeError from '../../../common/SidetreeError';
import TransactionModel from '../../../common/models/TransactionModel';
import ValueTimeLockVerifier from './ValueTimeLockVerifier';

/**
 * Implementation of the `ITransactionProcessor`.
 */
export default class TransactionProcessor implements ITransactionProcessor {
  public constructor (private downloadManager: DownloadManager, private operationStore: IOperationStore, private blockchain: IBlockchain) { }

  public async processTransaction (transaction: TransactionModel): Promise<boolean> {
    try {
      // Decode the anchor string.
      const anchoredData = AnchoredDataSerializer.deserialize(transaction.anchorString);

      // Verify enough fee paid.
      FeeManager.verifyTransactionFeeAndThrowOnError(transaction.transactionFeePaid, anchoredData.numberOfOperations, transaction.normalizedTransactionFee);

      // Download and verify anchor file.
      const anchorFile = await this.downloadAndVerifyAnchorFile(transaction, anchoredData.anchorFileHash, anchoredData.numberOfOperations);

      // Download and verify map file.
      const mapFileModel = await this.downloadAndVerifyMapFile(anchorFile, anchoredData.numberOfOperations);

      // Download and verify batch file.
      const batchFileModel = await this.downloadAndVerifyBatchFile(mapFileModel);

      // Compose into operations from all the files downloaded.
      const operations = this.composeAnchoredOperationModels(transaction, anchorFile, mapFileModel, batchFileModel);

      // If the code reaches here, it means that the batch of operations is valid, store the operations.
      await this.operationStore.put(operations);

      return true;
    } catch (error) {
      if (error instanceof SidetreeError) {
        // If error is potentially related to CAS network connectivity issues, we need to return false to retry later.
        if (error.code === ErrorCode.CasNotReachable ||
            error.code === ErrorCode.CasFileNotFound) {
          return false;
        }

        console.info(`Ignoring error: ${error.message}`);
        return true;
      } else {
        console.error(`Unexpected error processing transaction, MUST investigate and fix: ${error.message}`);
        return false;
      }
    }
  }

  /**
   * @param batchSize The size of the batch in number of operations.
   */
  private async downloadAndVerifyAnchorFile (transaction: TransactionModel, anchorFileHash: string, paidOperationCount: number): Promise<AnchorFile> {
    // Verify the number of paid operations does not exceed the maximum allowed limit.
    if (paidOperationCount > ProtocolParameters.maxOperationsPerBatch) {
      throw new SidetreeError(
        ErrorCode.TransactionProcessorPaidOperationCountExceedsLimit,
        `Paid batch size of ${paidOperationCount} operations exceeds the allowed limit of ${ProtocolParameters.maxOperationsPerBatch}.`
      );
    }

    console.info(`Downloading anchor file '${anchorFileHash}', max file size limit ${ProtocolParameters.maxAnchorFileSizeInBytes} bytes...`);

    const fileBuffer = await this.downloadFileFromCas(anchorFileHash, ProtocolParameters.maxAnchorFileSizeInBytes);
    const anchorFile = await AnchorFile.parse(fileBuffer);

    const operationCountInAnchorFile = anchorFile.didUniqueSuffixes.length;
    if (operationCountInAnchorFile > paidOperationCount) {
      throw new SidetreeError(
        ErrorCode.AnchorFileOperationCountExceededPaidLimit,
        `Operation count ${operationCountInAnchorFile} in anchor file exceeded limit of : ${paidOperationCount}`);
    }

    // Verify required lock if one was needed.
    const valueTimeLock = anchorFile.model.writerLockId
                          ? await this.blockchain.getValueTimeLock(anchorFile.model.writerLockId)
                          : undefined;

    ValueTimeLockVerifier.verifyLockAmountAndThrowOnError(
      valueTimeLock,
      operationCountInAnchorFile,
      transaction.normalizedTransactionFee,
      transaction.transactionTime,
      transaction.writer);

    return anchorFile;
  }

  private async downloadAndVerifyMapFile (anchorFile: AnchorFile, paidOperationCount: number): Promise<MapFileModel> {
    const anchorFileModel = anchorFile.model;
    console.info(`Downloading map file '${anchorFileModel.mapFileHash}', max file size limit ${ProtocolParameters.maxMapFileSizeInBytes}...`);

    const fileBuffer = await this.downloadFileFromCas(anchorFileModel.mapFileHash, ProtocolParameters.maxMapFileSizeInBytes);
    const mapFileModel = await MapFile.parse(fileBuffer);

    // Calulate the max paid update operation count.
    const operationCountInAnchorFile = anchorFile.didUniqueSuffixes.length;
    const maxPaidUpdateOperationCount = paidOperationCount - operationCountInAnchorFile;

    const updateOperationCount = mapFileModel.updateOperations ? mapFileModel.updateOperations.length : 0;
    if (updateOperationCount > maxPaidUpdateOperationCount) {
      throw new SidetreeError(
        ErrorCode.MapFileUpdateOperationCountExceededPaidLimit,
        `Max allowed update operation count: ${maxPaidUpdateOperationCount}, but got: ${updateOperationCount}`);
    }

    // Ensure there is no operation for the same DID in both anchor and map files.
    let didUniqueSuffixesInMapFile: string[] = [];
    if (mapFileModel.updateOperations !== undefined) {
      didUniqueSuffixesInMapFile = mapFileModel.updateOperations.map(operation => operation.didUniqueSuffix);

      if (!ArrayMethods.areMutuallyExclusive(anchorFile.didUniqueSuffixes, didUniqueSuffixesInMapFile)) {
        throw new SidetreeError(ErrorCode.TransactionProcessorOperationForTheSameDidInBothAnchorAndMapFile);
      }
    }

    return mapFileModel;
  }

  private async downloadAndVerifyBatchFile (
    mapFile: MapFileModel
  ): Promise<BatchFileModel> {
    const batchFileHash = mapFile.batchFileHash;
    console.info(`Downloading batch file '${batchFileHash}', max size limit ${ProtocolParameters.maxBatchFileSizeInBytes}...`);

    const fileBuffer = await this.downloadFileFromCas(batchFileHash, ProtocolParameters.maxBatchFileSizeInBytes);
    const batchFileModel = await BatchFile.parse(fileBuffer);

    return batchFileModel;
  }

  private composeAnchoredOperationModels (
    transaction: TransactionModel,
    anchorFile: AnchorFile,
    mapFile: MapFileModel,
    batchFile: BatchFileModel
  ): AnchoredOperationModel[] {

    let createOperations = anchorFile.createOperations;
    let recoverOperations = anchorFile.recoverOperations;
    let revokeOperations = anchorFile.revokeOperations;
    let updateOperations = mapFile.updateOperations ? mapFile.updateOperations : [];

    // Add `type` property for later convenience.
    updateOperations = updateOperations.map((operation) => Object.assign(operation, { type: OperationType.Update }));

    // Add the operations in the following order of types: create, recover, update, revoke.
    const operations = [];
    operations.push(...createOperations);
    operations.push(...recoverOperations);
    operations.push(...updateOperations);
    operations.push(...revokeOperations);

    // Add operation data from batch file to to each operation.
    // NOTE: there is no operation data for revoke operations.
    const operationCountExcludingRevokes = createOperations.length + recoverOperations.length + updateOperations.length;
    for (let i = 0; i < operationCountExcludingRevokes &&
                    i < batchFile.operationData.length; i++) {
      operations[i].operationData = batchFile.operationData[i];
    }

    // Add anchored timestamp to each operation.
    const anchoredOperationModels = [];
    for (let i = 0; i < operations.length; i++) {
      const operation = operations[i];
      const operationBuffer = Buffer.from(JSON.stringify(operation));

      const anchoredOperationModel: AnchoredOperationModel = {
        didUniqueSuffix: operation.didUniqueSuffix,
        type: operation.type,
        operationBuffer,
        operationIndex: i,
        transactionNumber: transaction.transactionNumber,
        transactionTime: transaction.transactionTime
      };

      anchoredOperationModels.push(anchoredOperationModel);
    }

    return anchoredOperationModels;
  }

  private async downloadFileFromCas (fileHash: string, maxFileSizeInBytes: number): Promise<Buffer> {
    console.info(`Downloading file '${fileHash}', max size limit ${maxFileSizeInBytes}...`);

    const fileFetchResult = await this.downloadManager.download(fileHash, maxFileSizeInBytes);

    if (fileFetchResult.code === FetchResultCode.InvalidHash) {
      throw new SidetreeError(ErrorCode.CasFileHashNotValid, `File hash '${fileHash}' is not a valid hash.`);
    }

    if (fileFetchResult.code === FetchResultCode.MaxSizeExceeded) {
      throw new SidetreeError(ErrorCode.CasFileTooLarge, `File '${fileHash}' exceeded max size limit of ${maxFileSizeInBytes} bytes.`);
    }

    if (fileFetchResult.code === FetchResultCode.NotAFile) {
      throw new SidetreeError(ErrorCode.CasFileNotAFile, `File hash '${fileHash}' points to a content that is not a file.`);
    }

    if (fileFetchResult.code === FetchResultCode.CasNotReachable) {
      throw new SidetreeError(ErrorCode.CasNotReachable, `CAS not reachable for file '${fileHash}'.`);
    }

    if (fileFetchResult.code === FetchResultCode.NotFound) {
      throw new SidetreeError(ErrorCode.CasFileNotFound, `File '${fileHash}' not found.`);
    }

    console.info(`File '${fileHash}' of size ${fileFetchResult.content!.length} downloaded.`);

    return fileFetchResult.content!;
  }
}

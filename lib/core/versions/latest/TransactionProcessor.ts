import AnchoredDataSerializer from './AnchoredDataSerializer';
import AnchoredOperationModel from '../../models/AnchoredOperationModel';
import AnchorFileModel from './models/AnchorFileModel';
import AnchorFile from './AnchorFile';
import BatchFile from './BatchFile';
import DownloadManager from '../../DownloadManager';
import ErrorCode from './ErrorCode';
import FeeManager from './FeeManager';
import FetchResultCode from '../../../common/FetchResultCode';
import IOperationStore from '../../interfaces/IOperationStore';
import ITransactionProcessor from '../../interfaces/ITransactionProcessor';
import MapFile from './MapFile';
import MapFileModel from './models/MapFileModel';
import OperationType from '../../enums/OperationType';
import ProtocolParameters from './ProtocolParameters';
import SidetreeError from '../../../common/SidetreeError';
import TransactionModel from '../../../common/models/TransactionModel';
import CreateOperation from './CreateOperation';
import BatchFileModel from './models/BatchFileModel';

/**
 * Implementation of the `ITransactionProcessor`.
 */
export default class TransactionProcessor implements ITransactionProcessor {
  public constructor (private downloadManager: DownloadManager, private operationStore: IOperationStore) { }

  public async processTransaction (transaction: TransactionModel): Promise<boolean> {
    try {
      // Decode the anchor string.
      const anchoredData = AnchoredDataSerializer.deserialize(transaction.anchorString);

      // Verify enough fee paid.
      FeeManager.verifyTransactionFeeAndThrowOnError(transaction.transactionFeePaid, anchoredData.numberOfOperations, transaction.normalizedTransactionFee);

      // Download and verify anchor file.
      const anchorFileModel = await this.downloadAndVerifyAnchorFile(anchoredData.anchorFileHash, anchoredData.numberOfOperations);

      // Download and verify anchor file.
      const mapFileModel = await this.downloadAndVerifyMapFile(anchorFileModel, anchoredData.numberOfOperations);

      // Download and verify batch file.
      const batchFileModel = await this.downloadAndVerifyBatchFile(mapFileModel);

      // Compose into operations from all the files downloaded.
      const operations = await this.composeAnchoredOperationModels(transaction, anchorFileModel, mapFileModel, batchFileModel);

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
  private async downloadAndVerifyAnchorFile (anchorFileHash: string, paidBatchSize: number): Promise<AnchorFileModel> {
    // Verify the number of paid operations does not exceed the maximum allowed limit.
    if (paidBatchSize > ProtocolParameters.maxOperationsPerBatch) {
      throw new SidetreeError(
        ErrorCode.TransactionProcessorPaidOperationCountExceedsLimit,
        `Paid batch size of ${paidBatchSize} operations exceeds the allowed limit of ${ProtocolParameters.maxOperationsPerBatch}.`
      );
    }

    console.info(`Downloading anchor file '${anchorFileHash}', max file size limit ${ProtocolParameters.maxAnchorFileSizeInBytes} bytes...`);

    const fileBuffer = await this.downloadFileFromCas(anchorFileHash, ProtocolParameters.maxAnchorFileSizeInBytes);
    const anchorFileModel = await AnchorFile.parse(fileBuffer);
    const operations = anchorFileModel.operations;

    const createOperations = operations.createOperations ? operations.createOperations : [];
    const recoverOperations = operations.recoverOperations ? operations.recoverOperations : [];
    const revokeOperations = operations.revokeOperations ? operations.revokeOperations : [];

    const operationCountInAnchorFile = createOperations.length + recoverOperations.length + revokeOperations.length;
    if (operationCountInAnchorFile > paidBatchSize) {
      throw new SidetreeError(
        ErrorCode.AnchorFileOperationCountExceededPaidLimit,
        `Operation count ${operationCountInAnchorFile} in anchor file exceeded limit of : ${paidBatchSize}`);
    }

    return anchorFileModel;
  }

  private async downloadAndVerifyMapFile (anchorFileModel: AnchorFileModel, paidBatchSize: number): Promise<MapFileModel> {
    console.info(`Downloading map file '${anchorFileModel.mapFileHash}', max file size limit ${ProtocolParameters.maxMapFileSizeInBytes}...`);

    const fileBuffer = await this.downloadFileFromCas(anchorFileModel.mapFileHash, ProtocolParameters.maxMapFileSizeInBytes);
    const mapFileModel = await MapFile.parse(fileBuffer);

    // Calulate the max paid update operation count.
    const anchorFileOperations = anchorFileModel.operations;
    const createOperations = anchorFileOperations.createOperations ? anchorFileOperations.createOperations : [];
    const recoverOperations = anchorFileOperations.recoverOperations ? anchorFileOperations.recoverOperations : [];
    const revokeOperations = anchorFileOperations.revokeOperations ? anchorFileOperations.revokeOperations : [];
    const operationCountInAnchorFile = createOperations.length + recoverOperations.length + revokeOperations.length;
    const maxPaidUpdateOperationCount = paidBatchSize - operationCountInAnchorFile;

    if (mapFileModel.updateOperations !== undefined &&
        mapFileModel.updateOperations.length > maxPaidUpdateOperationCount) {
      throw new SidetreeError(
        ErrorCode.MapFileUpdateOperationCountExceededPaidLimit,
        `Max allowed update operation count: ${maxPaidUpdateOperationCount}, but got: ${mapFileModel.updateOperations.length}`);
    }

    // TODO: ensure there is no operation for the same DID between anchor and map files.

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
    anchorFile: AnchorFileModel,
    mapFile: MapFileModel,
    batchFile: BatchFileModel
  ): AnchoredOperationModel[] {

    let createOperations = anchorFile.operations.createOperations ? anchorFile.operations.createOperations : [];
    let recoverOperations = anchorFile.operations.recoverOperations ? anchorFile.operations.recoverOperations : [];
    let updateOperations = mapFile.updateOperations ? mapFile.updateOperations : [];
    let revokeOperations = anchorFile.operations.revokeOperations ? anchorFile.operations.revokeOperations : [];

    // Add implied properties for later convenience.
    recoverOperations = recoverOperations.map((operation) => Object.assign(operation, { type: OperationType.Recover }));
    updateOperations = updateOperations.map((operation) => Object.assign(operation, { type: OperationType.Update }));
    revokeOperations = revokeOperations.map((operation) => Object.assign(operation, { type: OperationType.Revoke }));
    createOperations = createOperations.map(
      (operation) => Object.assign(operation, { type: OperationType.Create, didUniqueSuffix: CreateOperation.computeDidUniqueSuffix(operation.suffixData) }));

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

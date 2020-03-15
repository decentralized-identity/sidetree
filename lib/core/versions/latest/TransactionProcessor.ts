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
import ProtocolParameters from './ProtocolParameters';
import SidetreeError from '../../../common/SidetreeError';
import TransactionModel from '../../../common/models/TransactionModel';

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
      const anchorFile = await this.downloadAndVerifyAnchorFile(anchoredData.anchorFileHash, anchoredData.numberOfOperations);

      // Download and verify anchor file.
      const mapFile = await this.downloadAndVerifyMapFile(anchorFile.mapFileHash);

      // Download and verify batch file.
      const operations = await this.downloadAndVerifyBatchFile(transaction, anchorFile, mapFile);

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

  private async downloadAndVerifyAnchorFile (anchorFileHash: string, expectedCountOfUniqueSuffixes: number): Promise<AnchorFileModel> {
    console.info(`Downloading anchor file '${anchorFileHash}', max size limit ${ProtocolParameters.maxAnchorFileSizeInBytes} bytes...`);

    const fileBuffer = await this.downloadFileFromCas(anchorFileHash, ProtocolParameters.maxAnchorFileSizeInBytes);
    const anchorFileModel = await AnchorFile.parseAndValidate(fileBuffer);

    if (anchorFileModel.didUniqueSuffixes.length !== expectedCountOfUniqueSuffixes) {
      throw new SidetreeError(
        ErrorCode.AnchorFileDidUniqueSuffixesCountIncorrect,
        `Did unique suffixes count: ${anchorFileModel.didUniqueSuffixes.length} is different from the expected count: ${expectedCountOfUniqueSuffixes}`);
    }

    return anchorFileModel;
  }

  private async downloadAndVerifyMapFile (mapFileHash: string): Promise<MapFileModel> {
    console.info(`Downloading map file '${mapFileHash}', max size limit ${ProtocolParameters.maxMapFileSizeInBytes}...`);

    const fileBuffer = await this.downloadFileFromCas(mapFileHash, ProtocolParameters.maxBatchFileSizeInBytes);
    const mapFileModel = await MapFile.parseAndValidate(fileBuffer);

    return mapFileModel;
  }

  private async downloadAndVerifyBatchFile (
    transaction: TransactionModel,
    anchorFile: AnchorFileModel,
    mapFile: MapFileModel
  ): Promise<AnchoredOperationModel[]> {
    const batchFileHash = mapFile.batchFileHash;
    console.info(`Downloading batch file '${batchFileHash}', max size limit ${ProtocolParameters.maxBatchFileSizeInBytes}...`);

    const fileBuffer = await this.downloadFileFromCas(batchFileHash, ProtocolParameters.maxBatchFileSizeInBytes);
    const operations = await BatchFile.parseAndValidate(fileBuffer, anchorFile, transaction.transactionNumber, transaction.transactionTime);

    return operations;
  }

  private async downloadFileFromCas (fileHash: string, maxFileSizeInBytes: number): Promise<Buffer> {
    console.info(`Downloading file '${fileHash}', max size limit ${maxFileSizeInBytes}...`);

    const fileFetchResult = await this.downloadManager.download(fileHash, maxFileSizeInBytes);

    if (fileFetchResult.code === FetchResultCode.InvalidHash) {
      throw new SidetreeError(ErrorCode.CasFileHashNotValid, `File hash '${fileHash}' is not a valid hash.`);
    }

    if (fileFetchResult.code === FetchResultCode.MaxSizeExceeded) {
      throw new SidetreeError(ErrorCode.CasFileTooLarge, `File '${fileHash}' exceeded max size limit of ${maxFileSizeInBytes} bytes.`
      );
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

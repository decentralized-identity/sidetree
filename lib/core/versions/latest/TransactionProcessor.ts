import AnchoredDataSerializer from './AnchoredDataSerializer';
import AnchorFileModel from './models/AnchorFileModel';
import AnchorFile from './AnchorFile';
import BatchFile from './BatchFile';
import DownloadManager from '../../DownloadManager';
import ErrorCode from './ErrorCode';
import FeeManager from './FeeManager';
import FetchResultCode from '../../../common/FetchResultCode';
import IOperationStore from '../../interfaces/IOperationStore';
import ITransactionProcessor from '../../interfaces/ITransactionProcessor';
import NamedAnchoredOperationModel from '../../models/NamedAnchoredOperationModel';
import ProtocolParameters from './ProtocolParameters';
import SidetreeError from '../../SidetreeError';
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
      const anchorFile = await this.downloadAndVerifyAnchorFile(anchoredData.anchorFileHash);

      // Download and verify batch file.
      const operations = await this.downloadAndVerifyBatchFile(anchorFile, transaction);

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
        console.error(`Unexpected error processing anchor string, MUST investigate and fix: ${error.message}`);
        return false;
      }
    }
  }

  private async downloadAndVerifyAnchorFile (anchorFileHash: string): Promise<AnchorFileModel> {
    console.info(`Downloading anchor file '${anchorFileHash}', max size limit ${ProtocolParameters.maxAnchorFileSizeInBytes} bytes...`);
    const anchorFileFetchResult = await this.downloadManager.download(anchorFileHash, ProtocolParameters.maxAnchorFileSizeInBytes);

    if (anchorFileFetchResult.code === FetchResultCode.InvalidHash) {
      throw new SidetreeError(ErrorCode.AnchorFileHashNotValid, `Anchor file '${anchorFileHash}' is not a valid hash.`);
    }

    if (anchorFileFetchResult.code === FetchResultCode.MaxSizeExceeded) {
      throw new SidetreeError(
        ErrorCode.AnchorFileTooLarge,
        `Anchor file '${anchorFileHash}' exceeded max size limit ${ProtocolParameters.maxAnchorFileSizeInBytes} bytes.`
      );
    }

    if (anchorFileFetchResult.code === FetchResultCode.NotAFile) {
      throw new SidetreeError(ErrorCode.AnchorFileNotAFile, `Anchor file hash '${anchorFileHash}' points to a content that is not a file.`);
    }

    if (anchorFileFetchResult.code === FetchResultCode.CasNotReachable) {
      throw new SidetreeError(ErrorCode.CasNotReachable, `CAS not reachable for anchor file '${anchorFileHash}', will try again later.`);
    }

    if (anchorFileFetchResult.code === FetchResultCode.NotFound) {
      throw new SidetreeError(ErrorCode.CasFileNotFound, `Anchor file '${anchorFileHash}' not found, will try again later.`);
    }

    console.info(`Anchor file '${anchorFileHash}' of size ${anchorFileFetchResult.content!.length} bytes downloaded.`);
    const maxOperationsPerBatch = ProtocolParameters.maxOperationsPerBatch;
    const anchorFile = await AnchorFile.parseAndValidate(
      anchorFileFetchResult.content!,
      maxOperationsPerBatch
    );

    return anchorFile;
  }

  private async downloadAndVerifyBatchFile (anchorFile: AnchorFileModel, transaction: TransactionModel): Promise<NamedAnchoredOperationModel[]> {
    console.info(`Downloading batch file '${anchorFile.batchFileHash}', max size limit ${ProtocolParameters.maxBatchFileSizeInBytes}...`);
    const batchFileHash = anchorFile.batchFileHash;
    const batchFileFetchResult = await this.downloadManager.download(batchFileHash, ProtocolParameters.maxBatchFileSizeInBytes);

    if (batchFileFetchResult.code === FetchResultCode.InvalidHash) {
      throw new SidetreeError(ErrorCode.BatchFileHashNotValid, `Batch file '${batchFileHash}' is not a valid hash.`);
    }

    if (batchFileFetchResult.code === FetchResultCode.MaxSizeExceeded) {
      throw new SidetreeError(
        ErrorCode.BatchFileTooLarge,
        `Batch file '${batchFileHash}' exceeded max size limit ${ProtocolParameters.maxBatchFileSizeInBytes}...`
      );
    }

    if (batchFileFetchResult.code === FetchResultCode.NotAFile) {
      throw new SidetreeError(ErrorCode.BatchFileNotAFile, `Batch file hash '${batchFileHash}' points to a content that is not a file.`);
    }

    if (batchFileFetchResult.code === FetchResultCode.CasNotReachable) {
      throw new SidetreeError(ErrorCode.CasNotReachable, `CAS not reachable for batch file '${batchFileHash}', will try again later.`);
    }

    if (batchFileFetchResult.code === FetchResultCode.NotFound) {
      throw new SidetreeError(ErrorCode.CasFileNotFound, `Batch file '${batchFileHash}' not found, will try again later.`);
    }

    console.info(`Batch file '${batchFileHash}' of size ${batchFileFetchResult.content!.length} downloaded.`);

    const operations
      = await BatchFile.parseAndValidate(batchFileFetchResult.content!, anchorFile, transaction.transactionNumber, transaction.transactionTime);

    return operations;
  }
}

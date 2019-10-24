import AnchorFileModel from './models/AnchorFileModel';
import AnchorFile from './AnchorFile';
import BatchFile from './BatchFile';
import DownloadManager from '../../DownloadManager';
import IOperationStore from '../../interfaces/IOperationStore';
import ITransactionProcessor from '../../interfaces/ITransactionProcessor';
import NamedAnchoredOperationModel from '../../models/NamedAnchoredOperationModel';
import ProtocolParameters from './ProtocolParameters';
import timeSpan = require('time-span');
import TransactionModel from '../../../common/models/TransactionModel';
import { FetchResultCode } from '../../../common/FetchResultCode';
import { SidetreeError } from '../../Error';

/**
 * Implementation of the `ITransactionProcessor`.
 */
export default class TransactionProcessor implements ITransactionProcessor {
  public constructor (private downloadManager: DownloadManager, private operationStore: IOperationStore) { }

  public async processTransaction (transaction: TransactionModel): Promise<boolean> {
    // The anchor string in this protocol version is just the anchor file hash.
    const anchorFileHash = transaction.anchorString;

    console.info(`Downloading anchor file '${anchorFileHash}', max size limit ${ProtocolParameters.maxAnchorFileSizeInBytes} bytes...`);
    const anchorFileFetchResult = await this.downloadManager.download(anchorFileHash, ProtocolParameters.maxAnchorFileSizeInBytes);

    // No thing to process if the file hash is invalid. No retry needed.
    if (anchorFileFetchResult.code === FetchResultCode.InvalidHash) {
      console.info(`Anchor file '${anchorFileHash}' is not a valid hash.`);
      return true;
    }

    // No thing to process if the file size exceeds protocol specified size limit, no retry needed either.
    if (anchorFileFetchResult.code === FetchResultCode.MaxSizeExceeded) {
      console.info(`Anchor file '${anchorFileHash}' exceeded max size limit ${ProtocolParameters.maxAnchorFileSizeInBytes} bytes.`);
      return true;
    }

    // Content for hash exists but is not a file. No retry needed.
    if (anchorFileFetchResult.code === FetchResultCode.NotAFile) {
      console.info(`Anchor file hash '${anchorFileHash}' points to a content that is not a file.`);
      return true;
    }

    // If Content Addressable Storage is not reachable, mark the transaction for retry later.
    if (anchorFileFetchResult.code === FetchResultCode.CasNotReachable) {
      console.info(`CAS not reachable for anchor file '${anchorFileHash}', will try again later.`);
      return false;
    }

    // If file cannot be found, mark it for retry later.
    if (anchorFileFetchResult.code === FetchResultCode.NotFound) {
      console.info(`Anchor file '${anchorFileHash}' not found, will try again later.`);
      return false;
    }

    console.info(`Anchor file '${anchorFileHash}' of size ${anchorFileFetchResult.content!.length} bytes downloaded.`);
    let anchorFile: AnchorFileModel;
    try {
      const maxOperationsPerBatch = ProtocolParameters.maxOperationsPerBatch;
      anchorFile = await AnchorFile.parseAndValidate(
        anchorFileFetchResult.content!,
        maxOperationsPerBatch
      );
    } catch (error) {
      // Give meaningful/specific error code and message when possible.
      if (error instanceof SidetreeError) {
        console.info(`Invalid anchor file: ${error}`);
        console.info(`Anchor file '${anchorFileHash}' failed parsing/validation, transaction '${transaction.transactionNumber}' ignored...`);
        return true;
      } else {
        console.error(`Unexpected error processing anchor file, MUST investigate and fix: ${error}`);
        return false;
      }
    }

    console.info(`Downloading batch file '${anchorFile.batchFileHash}', max size limit ${ProtocolParameters.maxBatchFileSizeInBytes}...`);
    const batchFileFetchResult = await this.downloadManager.download(anchorFile.batchFileHash, ProtocolParameters.maxBatchFileSizeInBytes);

    // Nothing to process if the file hash is invalid. No retry needed.
    if (batchFileFetchResult.code === FetchResultCode.InvalidHash) {
      console.info(`Batch file '${anchorFile.batchFileHash}' is not a valid hash.`);
      return true;
    }

    // Nothing to process if the file size exceeds protocol specified size limit, no retry needed either.
    if (batchFileFetchResult.code === FetchResultCode.MaxSizeExceeded) {
      console.info(`Batch file '${anchorFile.batchFileHash}' exceeded max size limit ${ProtocolParameters.maxBatchFileSizeInBytes}...`);
      return true;
    }

    // Content for hash exists but is not a file. No retry needed.
    if (batchFileFetchResult.code === FetchResultCode.NotAFile) {
      console.info(`Batch file hash '${anchorFile.batchFileHash}' points to a content that is not a file.`);
      return true;
    }

    // If Content Addressable Storage is not reachable, mark the transaction for retry later.
    if (batchFileFetchResult.code === FetchResultCode.CasNotReachable) {
      console.info(`CAS not reachable for batch file '${anchorFile.batchFileHash}', will try again later.`);
      return false;
    }

    // If file cannot be found, mark it for retry later.
    if (batchFileFetchResult.code === FetchResultCode.NotFound) {
      console.info(`Batch file '${anchorFile.batchFileHash}' not found, will try again later.`);
      return false;
    }

    console.info(`Batch file '${anchorFile.batchFileHash}' of size ${batchFileFetchResult.content!.length} downloaded.`);

    let operations: NamedAnchoredOperationModel[];
    try {
      operations = await BatchFile.parseAndValidate(batchFileFetchResult.content!, anchorFile, transaction.transactionNumber, transaction.transactionTime);
    } catch (error) {
      console.info(error);
      console.info(`Batch file '${anchorFile.batchFileHash}' failed parsing/validation, transaction '${transaction.transactionNumber}' ignored.`);
      return true;
    }

    // If the code reaches here, it means that the batch of operations is valid, process the operations.
    const endTimer = timeSpan();
    await this.operationStore.put(operations);
    console.info(`Processed batch '${anchorFile.batchFileHash}' of ${operations.length} operations. Time taken: ${endTimer.rounded()} ms.`);

    return true;
  }
}

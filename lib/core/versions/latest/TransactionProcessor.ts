import AnchorFile, { IAnchorFile } from '../../AnchorFile';
import BatchFile from './BatchFile';
import DownloadManager from '../../DownloadManager';
import TransactionProcessor from '../../interfaces/TransactionProcessor';
import IResolvedTransaction from '../../interfaces/IResolvedTransaction';
import ITransaction from '../../../common/ITransaction';
import OperationStore from '../../interfaces/OperationStore';
import protocolParameters from './ProtocolParameters';
import timeSpan = require('time-span');
import { FetchResultCode } from '../../../common/FetchResultCode';
import { Operation } from '../../Operation';
import { SidetreeError } from '../../Error';

/**
 * The latest implementation of the `TransactionProcessor`.
 */
export default class TransactionProcessorLatest implements TransactionProcessor {
  public constructor (private downloadManager: DownloadManager, private operationStore: OperationStore) { }

  public async processTransaction (
    transaction: ITransaction,
    allSupportedHashAlgorithms: number [],
    getHashAlgorithmInMultihashCode: (blockchainTime: number) => number): Promise<boolean> {
    console.info(`Downloading anchor file '${transaction.anchorFileHash}', max size limit ${protocolParameters.maxAnchorFileSizeInBytes} bytes...`);
    const anchorFileFetchResult = await this.downloadManager.download(transaction.anchorFileHash, protocolParameters.maxAnchorFileSizeInBytes);

    // No thing to process if the file hash is invalid. No retry needed.
    if (anchorFileFetchResult.code === FetchResultCode.InvalidHash) {
      console.info(`Anchor file '${transaction.anchorFileHash}' is not a valid hash.`);
      return true;
    }

    // No thing to process if the file size exceeds protocol specified size limit, no retry needed either.
    if (anchorFileFetchResult.code === FetchResultCode.MaxSizeExceeded) {
      console.info(`Anchor file '${transaction.anchorFileHash}' exceeded max size limit ${protocolParameters.maxAnchorFileSizeInBytes} bytes.`);
      return true;
    }

    // Content for hash exists but is not a file. No retry needed.
    if (anchorFileFetchResult.code === FetchResultCode.NotAFile) {
      console.info(`Anchor file hash '${transaction.anchorFileHash}' points to a content that is not a file.`);
      return true;
    }

    // If Content Addressable Storage is not reachable, mark the transaction for retry later.
    if (anchorFileFetchResult.code === FetchResultCode.CasNotReachable) {
      console.info(`CAS not reachable for anchor file '${transaction.anchorFileHash}', will try again later.`);
      return false;
    }

    // If file cannot be found, mark it for retry later.
    if (anchorFileFetchResult.code === FetchResultCode.NotFound) {
      console.info(`Anchor file '${transaction.anchorFileHash}' not found, will try again later.`);
      return false;
    }

    console.info(`Anchor file '${transaction.anchorFileHash}' of size ${anchorFileFetchResult.content!.length} bytes downloaded.`);
    let anchorFile: IAnchorFile;
    try {
      const maxOperationsPerBatch = protocolParameters.maxOperationsPerBatch;
      const hashAlgorithmInMultihashCode = protocolParameters.hashAlgorithmInMultihashCode;
      anchorFile = AnchorFile.parseAndValidate(anchorFileFetchResult.content!, maxOperationsPerBatch, hashAlgorithmInMultihashCode, allSupportedHashAlgorithms);
    } catch (error) {
      // Give meaningful/specific error code and message when possible.
      if (error instanceof SidetreeError) {
        console.info(`Invalid anchor file: ${error}`);
        console.info(`Anchor file '${transaction.anchorFileHash}' failed parsing/validation, transaction '${transaction.transactionNumber}' ignored...`);
        return true;
      } else {
        console.error(`Unexpected error processing anchor file, MUST investigate and fix: ${error}`);
        return false;
      }
    }

    console.info(`Downloading batch file '${anchorFile.batchFileHash}', max size limit ${protocolParameters.maxBatchFileSizeInBytes}...`);
    const batchFileFetchResult = await this.downloadManager.download(anchorFile.batchFileHash, protocolParameters.maxBatchFileSizeInBytes);

    // Nothing to process if the file hash is invalid. No retry needed.
    if (batchFileFetchResult.code === FetchResultCode.InvalidHash) {
      console.info(`Batch file '${anchorFile.batchFileHash}' is not a valid hash.`);
      return true;
    }

    // Nothing to process if the file size exceeds protocol specified size limit, no retry needed either.
    if (batchFileFetchResult.code === FetchResultCode.MaxSizeExceeded) {
      console.info(`Batch file '${anchorFile.batchFileHash}' exceeded max size limit ${protocolParameters.maxBatchFileSizeInBytes}...`);
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

    // Construct a resolved transaction from the original transaction object now that batch file is fetched.
    const resolvedTransaction: IResolvedTransaction = {
      transactionNumber: transaction.transactionNumber,
      transactionTime: transaction.transactionTime,
      transactionTimeHash: transaction.transactionTimeHash,
      anchorFileHash: transaction.anchorFileHash,
      batchFileHash: anchorFile.batchFileHash
    };

    let operations: Operation[];
    try {
      operations = await BatchFile.parseAndValidate(
        batchFileFetchResult.content!, anchorFile, resolvedTransaction, allSupportedHashAlgorithms, getHashAlgorithmInMultihashCode);
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

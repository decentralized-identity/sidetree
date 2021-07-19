import AnchoredData from './models/AnchoredData';
import AnchoredDataSerializer from './AnchoredDataSerializer';
import AnchoredOperationModel from '../../models/AnchoredOperationModel';
import ArrayMethods from './util/ArrayMethods';
import ChunkFile from './ChunkFile';
import ChunkFileModel from './models/ChunkFileModel';
import CoreIndexFile from './CoreIndexFile';
import CoreProofFile from './CoreProofFile';
import DownloadManager from '../../DownloadManager';
import ErrorCode from './ErrorCode';
import FeeManager from './FeeManager';
import FetchResultCode from '../../../common/enums/FetchResultCode';
import IBlockchain from '../../interfaces/IBlockchain';
import IOperationStore from '../../interfaces/IOperationStore';
import ITransactionProcessor from '../../interfaces/ITransactionProcessor';
import IVersionMetadataFetcher from '../../interfaces/IVersionMetadataFetcher';
import LogColor from '../../../common/LogColor';
import Logger from '../../../common/Logger';
import OperationType from '../../enums/OperationType';
import ProtocolParameters from './ProtocolParameters';
import ProvisionalIndexFile from './ProvisionalIndexFile';
import ProvisionalProofFile from './ProvisionalProofFile';
import SidetreeError from '../../../common/SidetreeError';
import TransactionModel from '../../../common/models/TransactionModel';
import ValueTimeLockVerifier from './ValueTimeLockVerifier';

/**
 * Implementation of the `ITransactionProcessor`.
 */
export default class TransactionProcessor implements ITransactionProcessor {
  public constructor (
    private downloadManager: DownloadManager,
    private operationStore: IOperationStore,
    private blockchain: IBlockchain,
    private versionMetadataFetcher: IVersionMetadataFetcher) {
  }

  public async processTransaction (transaction: TransactionModel): Promise<boolean> {

    // Download the core (index and proof) files.
    let anchoredData: AnchoredData;
    let coreIndexFile: CoreIndexFile;
    let coreProofFile: CoreProofFile | undefined;
    try {
      // Decode the anchor string.
      anchoredData = AnchoredDataSerializer.deserialize(transaction.anchorString);

      // Verify enough fee paid.
      FeeManager.verifyTransactionFeeAndThrowOnError(transaction.transactionFeePaid, anchoredData.numberOfOperations, transaction.normalizedTransactionFee!);

      // Download and verify core index file.
      coreIndexFile = await this.downloadAndVerifyCoreIndexFile(transaction, anchoredData.coreIndexFileUri, anchoredData.numberOfOperations);

      // Download and verify core proof file.
      coreProofFile = await this.downloadAndVerifyCoreProofFile(coreIndexFile);
    } catch (error) {
      let retryNeeded = true;
      if (error instanceof SidetreeError) {
        // If error is related to CAS network connectivity issues, we need to retry later.
        if (error.code === ErrorCode.CasNotReachable ||
            error.code === ErrorCode.CasFileNotFound) {
          retryNeeded = true;
        } else {
          // eslint-disable-next-line max-len
          Logger.info(LogColor.lightBlue(`Invalid core file found for anchor string '${LogColor.green(transaction.anchorString)}', the entire batch is discarded. Error: ${LogColor.yellow(error.message)}`));
          retryNeeded = false;
        }
      } else {
        Logger.error(LogColor.red(`Unexpected error while fetching and downloading core files, MUST investigate and fix: ${error.message}`));
        retryNeeded = true;
      }

      const transactionProcessedCompletely = !retryNeeded;
      return transactionProcessedCompletely;
    }

    // Once code reaches here, it means core files are valid. In order to be compatible with the future data-pruning feature,
    // the operations referenced in core index file must be retained regardless of the validity of provisional and chunk files.

    // Download provisional and chunk files.
    let retryNeeded: boolean;
    let provisionalIndexFile: ProvisionalIndexFile | undefined;
    let provisionalProofFile: ProvisionalProofFile | undefined;
    let chunkFileModel: ChunkFileModel | undefined;
    try {
      // Download and verify provisional index file.
      provisionalIndexFile = await this.downloadAndVerifyProvisionalIndexFile(coreIndexFile, anchoredData.numberOfOperations);

      // Download and verify provisional proof file.
      provisionalProofFile = await this.downloadAndVerifyProvisionalProofFile(provisionalIndexFile);

      // Download and verify chunk file.
      chunkFileModel = await this.downloadAndVerifyChunkFile(coreIndexFile, provisionalIndexFile);

      retryNeeded = false;
    } catch (error) {
      // If we encounter any error, regardless of whether the transaction should be retried for processing,
      // we set all the provisional/chunk files to be `undefined`,
      // this is because chunk file would not be available/valid for its deltas to be used during resolutions,
      // thus no need to store the operation references found in the provisional index file.
      provisionalIndexFile = undefined;
      provisionalProofFile = undefined;
      chunkFileModel = undefined;

      // Now we decide if we should try to process this transaction again in the future.
      if (error instanceof SidetreeError) {
        // If error is related to CAS network connectivity issues, we need to retry later.
        if (error.code === ErrorCode.CasNotReachable ||
            error.code === ErrorCode.CasFileNotFound) {
          retryNeeded = true;
        } else {
          // eslint-disable-next-line max-len
          Logger.info(LogColor.lightBlue(`Invalid provisional/chunk file found for anchor string '${LogColor.green(transaction.anchorString)}', the entire batch is discarded. Error: ${LogColor.yellow(error.message)}`));
          retryNeeded = false;
        }
      } else {
        Logger.error(LogColor.red(`Unexpected error while fetching and downloading provisional files, MUST investigate and fix: ${error.message}`));
        retryNeeded = true;
      }
    }

    // Once code reaches here, it means all the files that are not `undefined` (and their relationships) are validated,
    // there is no need to perform any more validations at this point, we just need to compose the anchored operations and store them.

    // Compose using files downloaded into anchored operations.
    const operations = await this.composeAnchoredOperationModels(
      transaction, coreIndexFile, provisionalIndexFile, coreProofFile, provisionalProofFile, chunkFileModel
    );

    await this.operationStore.insertOrReplace(operations);

    Logger.info(LogColor.lightBlue(`Processed ${LogColor.green(operations.length)} operations. Retry needed: ${LogColor.green(retryNeeded)}`));

    const transactionProcessedCompletely = !retryNeeded;
    return transactionProcessedCompletely;
  }

  private async downloadAndVerifyCoreIndexFile (transaction: TransactionModel, coreIndexFileUri: string, paidOperationCount: number): Promise<CoreIndexFile> {
    // Verify the number of paid operations does not exceed the maximum allowed limit.
    if (paidOperationCount > ProtocolParameters.maxOperationsPerBatch) {
      throw new SidetreeError(
        ErrorCode.TransactionProcessorPaidOperationCountExceedsLimit,
        `Paid batch size of ${paidOperationCount} operations exceeds the allowed limit of ${ProtocolParameters.maxOperationsPerBatch}.`
      );
    }

    Logger.info(`Downloading core index file '${coreIndexFileUri}', max file size limit ${ProtocolParameters.maxCoreIndexFileSizeInBytes} bytes...`);

    const fileBuffer = await this.downloadFileFromCas(coreIndexFileUri, ProtocolParameters.maxCoreIndexFileSizeInBytes);
    const coreIndexFile = await CoreIndexFile.parse(fileBuffer);

    const operationCountInCoreIndexFile = coreIndexFile.didUniqueSuffixes.length;
    if (operationCountInCoreIndexFile > paidOperationCount) {
      throw new SidetreeError(
        ErrorCode.CoreIndexFileOperationCountExceededPaidLimit,
        `Operation count ${operationCountInCoreIndexFile} in core index file exceeded limit of : ${paidOperationCount}`);
    }

    // Verify required lock if one was needed.
    const valueTimeLock = coreIndexFile.model.writerLockId
      ? await this.blockchain.getValueTimeLock(coreIndexFile.model.writerLockId)
      : undefined;
    ValueTimeLockVerifier.verifyLockAmountAndThrowOnError(
      valueTimeLock,
      paidOperationCount,
      transaction.transactionTime,
      transaction.writer,
      this.versionMetadataFetcher);

    return coreIndexFile;
  }

  private async downloadAndVerifyCoreProofFile (coreIndexFile: CoreIndexFile): Promise<CoreProofFile | undefined> {
    const coreProofFileUri = coreIndexFile.model.coreProofFileUri;
    if (coreProofFileUri === undefined) {
      return;
    }

    Logger.info(`Downloading core proof file '${coreProofFileUri}', max file size limit ${ProtocolParameters.maxProofFileSizeInBytes}...`);

    const fileBuffer = await this.downloadFileFromCas(coreProofFileUri, ProtocolParameters.maxProofFileSizeInBytes);
    const coreProofFile = await CoreProofFile.parse(fileBuffer, coreIndexFile.deactivateDidSuffixes);

    const recoverAndDeactivateCount = coreIndexFile.deactivateDidSuffixes.length + coreIndexFile.recoverDidSuffixes.length;
    const proofCountInCoreProofFile = coreProofFile.deactivateProofs.length + coreProofFile.recoverProofs.length;
    if (recoverAndDeactivateCount !== proofCountInCoreProofFile) {
      throw new SidetreeError(
        ErrorCode.CoreProofFileProofCountNotTheSameAsOperationCountInCoreIndexFile,
        `Proof count of ${proofCountInCoreProofFile} in core proof file different to ` +
        `recover + deactivate count of ${recoverAndDeactivateCount} in core index file.`
      );
    }

    return coreProofFile;
  }

  private async downloadAndVerifyProvisionalProofFile (provisionalIndexFile: ProvisionalIndexFile | undefined): Promise<ProvisionalProofFile | undefined> {
    // If there is no provisional proof file to download, just return.
    if (provisionalIndexFile === undefined || provisionalIndexFile.model.provisionalProofFileUri === undefined) {
      return;
    }

    const provisionalProofFileUri = provisionalIndexFile.model.provisionalProofFileUri;
    Logger.info(`Downloading provisional proof file '${provisionalProofFileUri}', max file size limit ${ProtocolParameters.maxProofFileSizeInBytes}...`);

    const fileBuffer = await this.downloadFileFromCas(provisionalProofFileUri, ProtocolParameters.maxProofFileSizeInBytes);
    const provisionalProofFile = await ProvisionalProofFile.parse(fileBuffer);

    const operationCountInProvisionalIndexFile = provisionalIndexFile.didUniqueSuffixes.length;
    const proofCountInProvisionalProofFile = provisionalProofFile.updateProofs.length;
    if (operationCountInProvisionalIndexFile !== proofCountInProvisionalProofFile) {
      throw new SidetreeError(
        ErrorCode.ProvisionalProofFileProofCountNotTheSameAsOperationCountInProvisionalIndexFile,
        `Proof count ${proofCountInProvisionalProofFile} in provisional proof file is different from ` +
        `operation count ${operationCountInProvisionalIndexFile} in provisional index file.`
      );
    }

    return provisionalProofFile;
  }

  private async downloadAndVerifyProvisionalIndexFile (coreIndexFile: CoreIndexFile, paidOperationCount: number): Promise<ProvisionalIndexFile | undefined> {
    const coreIndexFileModel = coreIndexFile.model;

    // If no provisional index file URI is defined (legitimate case when there is only deactivates in the operation batch),
    // then no provisional index file to download.
    const provisionalIndexFileUri = coreIndexFileModel.provisionalIndexFileUri;
    if (provisionalIndexFileUri === undefined) {
      return undefined;
    }

    Logger.info(
      `Downloading provisional index file '${provisionalIndexFileUri}', max file size limit ${ProtocolParameters.maxProvisionalIndexFileSizeInBytes}...`
    );

    const fileBuffer = await this.downloadFileFromCas(provisionalIndexFileUri, ProtocolParameters.maxProvisionalIndexFileSizeInBytes);
    const provisionalIndexFile = await ProvisionalIndexFile.parse(fileBuffer);

    // Calculate the max paid update operation count.
    const operationCountInCoreIndexFile = coreIndexFile.didUniqueSuffixes.length;
    const maxPaidUpdateOperationCount = paidOperationCount - operationCountInCoreIndexFile;

    const updateOperationCount = provisionalIndexFile.didUniqueSuffixes.length;
    if (updateOperationCount > maxPaidUpdateOperationCount) {
      throw new SidetreeError(
        ErrorCode.ProvisionalIndexFileUpdateOperationCountGreaterThanMaxPaidCount,
        `Update operation count of ${updateOperationCount} in provisional index file is greater than max paid count of ${maxPaidUpdateOperationCount}.`
      );
    }

    // If we find operations for the same DID between anchor and provisional index files,
    // we will penalize the writer by not accepting any updates.
    if (!ArrayMethods.areMutuallyExclusive(coreIndexFile.didUniqueSuffixes, provisionalIndexFile.didUniqueSuffixes)) {
      throw new SidetreeError(
        ErrorCode.ProvisionalIndexFileDidReferenceDuplicatedWithCoreIndexFile,
        `Provisional index file has at least one DID reference duplicated with core index file.`
      );
    }

    return provisionalIndexFile;
  }

  private async downloadAndVerifyChunkFile (
    coreIndexFile: CoreIndexFile,
    provisionalIndexFile: ProvisionalIndexFile | undefined
  ): Promise<ChunkFileModel | undefined> {
    // Can't download chunk file if provisional index file is not given.
    if (provisionalIndexFile === undefined) {
      return undefined;
    }

    const chunkFileUri = provisionalIndexFile.model.chunks[0].chunkFileUri;
    Logger.info(`Downloading chunk file '${chunkFileUri}', max size limit ${ProtocolParameters.maxChunkFileSizeInBytes}...`);

    const fileBuffer = await this.downloadFileFromCas(chunkFileUri, ProtocolParameters.maxChunkFileSizeInBytes);
    const chunkFileModel = await ChunkFile.parse(fileBuffer);

    const totalCountOfOperationsWithDelta =
      coreIndexFile.createDidSuffixes.length + coreIndexFile.recoverDidSuffixes.length + provisionalIndexFile.didUniqueSuffixes.length;

    if (chunkFileModel.deltas.length !== totalCountOfOperationsWithDelta) {
      throw new SidetreeError(
        ErrorCode.ChunkFileDeltaCountIncorrect,
        `Delta array length ${chunkFileModel.deltas.length} is not the same as the count of ${totalCountOfOperationsWithDelta} operations with delta.`
      );
    }

    return chunkFileModel;
  }

  private async composeAnchoredOperationModels (
    transaction: TransactionModel,
    coreIndexFile: CoreIndexFile,
    provisionalIndexFile: ProvisionalIndexFile | undefined,
    coreProofFile: CoreProofFile | undefined,
    provisionalProofFile: ProvisionalProofFile | undefined,
    chunkFile: ChunkFileModel | undefined
  ): Promise<AnchoredOperationModel[]> {
    const anchoredCreateOperationModels = TransactionProcessor.composeAnchoredCreateOperationModels(
      transaction, coreIndexFile, chunkFile
    );

    const anchoredRecoverOperationModels = TransactionProcessor.composeAnchoredRecoverOperationModels(
      transaction, coreIndexFile, coreProofFile!, chunkFile
    );

    const anchoredDeactivateOperationModels = TransactionProcessor.composeAnchoredDeactivateOperationModels(
      transaction, coreIndexFile, coreProofFile!
    );

    const anchoredUpdateOperationModels = TransactionProcessor.composeAnchoredUpdateOperationModels(
      transaction, coreIndexFile, provisionalIndexFile, provisionalProofFile, chunkFile
    );

    const anchoredOperationModels = [];
    anchoredOperationModels.push(...anchoredCreateOperationModels);
    anchoredOperationModels.push(...anchoredRecoverOperationModels);
    anchoredOperationModels.push(...anchoredDeactivateOperationModels);
    anchoredOperationModels.push(...anchoredUpdateOperationModels);
    return anchoredOperationModels;
  }

  private static composeAnchoredCreateOperationModels (
    transaction: TransactionModel,
    coreIndexFile: CoreIndexFile,
    chunkFile: ChunkFileModel | undefined
  ): AnchoredOperationModel[] {
    if (coreIndexFile.createDidSuffixes.length === 0) {
      return [];
    }

    let createDeltas;
    if (chunkFile !== undefined) {
      createDeltas = chunkFile.deltas.slice(0, coreIndexFile.createDidSuffixes.length);
    }

    const createDidSuffixes = coreIndexFile.createDidSuffixes;

    const anchoredOperationModels = [];
    for (let i = 0; i < createDidSuffixes.length; i++) {
      const suffixData = coreIndexFile.model.operations!.create![i].suffixData;

      // Compose the original operation request from the files.
      const composedRequest = {
        type: OperationType.Create,
        suffixData: suffixData,
        delta: createDeltas?.[i] // Add `delta` property if chunk file found.
      };

      // TODO: Issue 442 - https://github.com/decentralized-identity/sidetree/issues/442
      // Use actual operation request object instead of buffer.
      const operationBuffer = Buffer.from(JSON.stringify(composedRequest));

      const anchoredOperationModel: AnchoredOperationModel = {
        didUniqueSuffix: createDidSuffixes[i],
        type: OperationType.Create,
        operationBuffer,
        operationIndex: i,
        transactionNumber: transaction.transactionNumber,
        transactionTime: transaction.transactionTime
      };

      anchoredOperationModels.push(anchoredOperationModel);
    }

    return anchoredOperationModels;
  }

  private static composeAnchoredRecoverOperationModels (
    transaction: TransactionModel,
    coreIndexFile: CoreIndexFile,
    coreProofFile: CoreProofFile,
    chunkFile: ChunkFileModel | undefined
  ): AnchoredOperationModel[] {
    if (coreIndexFile.recoverDidSuffixes.length === 0) {
      return [];
    }

    let recoverDeltas;
    if (chunkFile !== undefined) {
      const recoverDeltaStartIndex = coreIndexFile.createDidSuffixes.length;
      const recoverDeltaEndIndexExclusive = recoverDeltaStartIndex + coreIndexFile.recoverDidSuffixes.length;
      recoverDeltas = chunkFile.deltas.slice(recoverDeltaStartIndex, recoverDeltaEndIndexExclusive);
    }

    const recoverDidSuffixes = coreIndexFile.recoverDidSuffixes;
    const recoverProofs = coreProofFile.recoverProofs.map((proof) => proof.signedDataJws.toCompactJws());

    const anchoredOperationModels = [];
    for (let i = 0; i < recoverDidSuffixes.length; i++) {
      // Compose the original operation request from the files.
      const composedRequest = {
        type: OperationType.Recover,
        didSuffix: recoverDidSuffixes[i],
        revealValue: coreIndexFile.model!.operations!.recover![i].revealValue,
        signedData: recoverProofs[i],
        delta: recoverDeltas?.[i] // Add `delta` property if chunk file found.
      };

      // TODO: Issue 442 - https://github.com/decentralized-identity/sidetree/issues/442
      // Use actual operation request object instead of buffer.
      const operationBuffer = Buffer.from(JSON.stringify(composedRequest));

      const anchoredOperationModel: AnchoredOperationModel = {
        didUniqueSuffix: recoverDidSuffixes[i],
        type: OperationType.Recover,
        operationBuffer,
        operationIndex: coreIndexFile.createDidSuffixes.length + i,
        transactionNumber: transaction.transactionNumber,
        transactionTime: transaction.transactionTime
      };

      anchoredOperationModels.push(anchoredOperationModel);
    }

    return anchoredOperationModels;
  }

  private static composeAnchoredDeactivateOperationModels (
    transaction: TransactionModel,
    coreIndexFile: CoreIndexFile,
    coreProofFile: CoreProofFile
  ): AnchoredOperationModel[] {
    if (coreIndexFile.deactivateDidSuffixes.length === 0) {
      return [];
    }

    const deactivateDidSuffixes = coreIndexFile.deactivateDidSuffixes;
    const deactivateProofs = coreProofFile.deactivateProofs.map((proof) => proof.signedDataJws.toCompactJws());

    const anchoredOperationModels = [];
    for (let i = 0; i < deactivateDidSuffixes.length; i++) {
      // Compose the original operation request from the files.
      const composedRequest = {
        type: OperationType.Deactivate,
        didSuffix: deactivateDidSuffixes[i],
        revealValue: coreIndexFile.model!.operations!.deactivate![i].revealValue,
        signedData: deactivateProofs[i]
      };

      // TODO: Issue 442 - https://github.com/decentralized-identity/sidetree/issues/442
      // Use actual operation request object instead of buffer.
      const operationBuffer = Buffer.from(JSON.stringify(composedRequest));

      const anchoredOperationModel: AnchoredOperationModel = {
        didUniqueSuffix: deactivateDidSuffixes[i],
        type: OperationType.Deactivate,
        operationBuffer,
        operationIndex: coreIndexFile.createDidSuffixes.length + coreIndexFile.recoverDidSuffixes.length + i,
        transactionNumber: transaction.transactionNumber,
        transactionTime: transaction.transactionTime
      };

      anchoredOperationModels.push(anchoredOperationModel);
    }

    return anchoredOperationModels;
  }

  private static composeAnchoredUpdateOperationModels (
    transaction: TransactionModel,
    coreIndexFile: CoreIndexFile,
    provisionalIndexFile: ProvisionalIndexFile | undefined,
    provisionalProofFile: ProvisionalProofFile | undefined,
    chunkFile: ChunkFileModel | undefined
  ): AnchoredOperationModel[] {
    // If provisional index file is undefined (in the case of batch containing only deactivates) or
    // if provisional index file's update operation reference count is zero (in the case of batch containing creates and/or recovers).
    if (provisionalIndexFile === undefined ||
        provisionalIndexFile.didUniqueSuffixes.length === 0) {
      return [];
    }

    let updateDeltas;
    if (chunkFile !== undefined) {
      const updateDeltaStartIndex = coreIndexFile.createDidSuffixes.length + coreIndexFile.recoverDidSuffixes.length;
      updateDeltas = chunkFile!.deltas.slice(updateDeltaStartIndex);
    }

    const updateDidSuffixes = provisionalIndexFile.didUniqueSuffixes;
    const updateProofs = provisionalProofFile!.updateProofs.map((proof) => proof.signedDataJws.toCompactJws());

    const anchoredOperationModels = [];
    for (let i = 0; i < updateDidSuffixes.length; i++) {
      // Compose the original operation request from the files.
      const composedRequest = {
        type: OperationType.Update,
        didSuffix: updateDidSuffixes[i],
        revealValue: provisionalIndexFile.model!.operations!.update[i].revealValue,
        signedData: updateProofs[i],
        delta: updateDeltas?.[i] // Add `delta` property if chunk file found.
      };

      // TODO: Issue 442 - https://github.com/decentralized-identity/sidetree/issues/442
      // Use actual operation request object instead of buffer.
      const operationBuffer = Buffer.from(JSON.stringify(composedRequest));

      const anchoredOperationModel: AnchoredOperationModel = {
        didUniqueSuffix: updateDidSuffixes[i],
        type: OperationType.Update,
        operationBuffer,
        operationIndex: coreIndexFile.didUniqueSuffixes.length + i,
        transactionNumber: transaction.transactionNumber,
        transactionTime: transaction.transactionTime
      };

      anchoredOperationModels.push(anchoredOperationModel);
    }

    return anchoredOperationModels;
  }

  private async downloadFileFromCas (fileUri: string, maxFileSizeInBytes: number): Promise<Buffer> {
    Logger.info(`Downloading file '${fileUri}', max size limit ${maxFileSizeInBytes}...`);

    const fileFetchResult = await this.downloadManager.download(fileUri, maxFileSizeInBytes);

    if (fileFetchResult.code === FetchResultCode.InvalidHash) {
      throw new SidetreeError(ErrorCode.CasFileUriNotValid, `File hash '${fileUri}' is not a valid hash.`);
    }

    if (fileFetchResult.code === FetchResultCode.MaxSizeExceeded) {
      throw new SidetreeError(ErrorCode.CasFileTooLarge, `File '${fileUri}' exceeded max size limit of ${maxFileSizeInBytes} bytes.`);
    }

    if (fileFetchResult.code === FetchResultCode.NotAFile) {
      throw new SidetreeError(ErrorCode.CasFileNotAFile, `File hash '${fileUri}' points to a content that is not a file.`);
    }

    if (fileFetchResult.code === FetchResultCode.CasNotReachable) {
      throw new SidetreeError(ErrorCode.CasNotReachable, `CAS not reachable for file '${fileUri}'.`);
    }

    if (fileFetchResult.code === FetchResultCode.NotFound) {
      throw new SidetreeError(ErrorCode.CasFileNotFound, `File '${fileUri}' not found.`);
    }

    Logger.info(`File '${fileUri}' of size ${fileFetchResult.content!.length} downloaded.`);

    return fileFetchResult.content!;
  }
}

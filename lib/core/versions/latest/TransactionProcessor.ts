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
    try {
      // Decode the anchor string.
      const anchoredData = AnchoredDataSerializer.deserialize(transaction.anchorString);

      // Verify enough fee paid.
      FeeManager.verifyTransactionFeeAndThrowOnError(transaction.transactionFeePaid, anchoredData.numberOfOperations, transaction.normalizedTransactionFee!);

      // Download and verify core index file.
      const coreIndexFile = await this.downloadAndVerifyCoreIndexFile(transaction, anchoredData.coreIndexFileHash, anchoredData.numberOfOperations);

      // Download and verify provisional index file.
      const provisionalIndexFile = await this.downloadAndVerifyProvisionalIndexFile(coreIndexFile, anchoredData.numberOfOperations);

      // Download and verify core proof file.
      const coreProofFile = await this.downloadAndVerifyCoreProofFile(coreIndexFile);

      // Download and verify provisional proof file.
      const provisionalProofFile = await this.downloadAndVerifyProvisionalProofFile(provisionalIndexFile);

      // Download and verify chunk file.
      const chunkFileModel = await this.downloadAndVerifyChunkFile(provisionalIndexFile);

      // Compose into operations from all the files downloaded.
      const operations = await this.composeAnchoredOperationModels(
        transaction, coreIndexFile, provisionalIndexFile, coreProofFile, provisionalProofFile, chunkFileModel
      );

      // If the code reaches here, it means that the batch of operations is valid, store the operations.
      await this.operationStore.put(operations);

      console.log(LogColor.lightBlue(`Processed ${operations.length} operations.`));

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
  private async downloadAndVerifyCoreIndexFile (transaction: TransactionModel, coreIndexFileHash: string, paidOperationCount: number): Promise<CoreIndexFile> {
    // Verify the number of paid operations does not exceed the maximum allowed limit.
    if (paidOperationCount > ProtocolParameters.maxOperationsPerBatch) {
      throw new SidetreeError(
        ErrorCode.TransactionProcessorPaidOperationCountExceedsLimit,
        `Paid batch size of ${paidOperationCount} operations exceeds the allowed limit of ${ProtocolParameters.maxOperationsPerBatch}.`
      );
    }

    console.info(`Downloading core index file '${coreIndexFileHash}', max file size limit ${ProtocolParameters.maxCoreIndexFileSizeInBytes} bytes...`);

    const fileBuffer = await this.downloadFileFromCas(coreIndexFileHash, ProtocolParameters.maxCoreIndexFileSizeInBytes);
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

    console.info(`Downloading core proof file '${coreProofFileUri}', max file size limit ${ProtocolParameters.maxProofFileSizeInBytes}...`);

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
    console.info(`Downloading provisional proof file '${provisionalProofFileUri}', max file size limit ${ProtocolParameters.maxProofFileSizeInBytes}...`);

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

  /**
   * NOTE: In order to be forward-compatible with data-pruning feature,
   * we must continue to process the operations declared in the core index file even if the map/chunk file is invalid.
   * This means that this method MUST ONLY throw errors that are retry-able (e.g. network or file not found errors),
   * It is a design choice to hide the complexity of provisional index file downloading and construction within this method,
   * instead of throwing errors and letting the caller handle them.
   * @returns `ProvisionalIndexFile` if downloaded file is valid; `undefined` otherwise.
   * @throws SidetreeErrors that are retry-able.
   */
  private async downloadAndVerifyProvisionalIndexFile (coreIndexFile: CoreIndexFile, paidOperationCount: number): Promise<ProvisionalIndexFile | undefined> {
    try {
      const coreIndexFileModel = coreIndexFile.model;

      // If no provisional index file URI is defined (legitimate case when there is only deactivates in the operation batch),
      // then no provisional index file to download.
      const provisionalIndexFileUri = coreIndexFileModel.provisionalIndexFileUri;
      if (provisionalIndexFileUri === undefined) {
        return undefined;
      }

      console.info(
        `Downloading provisional index file '${provisionalIndexFileUri}', max file size limit ${ProtocolParameters.maxProvisionalIndexFileSizeInBytes}...`
      );

      const fileBuffer = await this.downloadFileFromCas(provisionalIndexFileUri, ProtocolParameters.maxProvisionalIndexFileSizeInBytes);
      const provisionalIndexFile = await ProvisionalIndexFile.parse(fileBuffer);

      // Calculate the max paid update operation count.
      const operationCountInCoreIndexFile = coreIndexFile.didUniqueSuffixes.length;
      const maxPaidUpdateOperationCount = paidOperationCount - operationCountInCoreIndexFile;

      // If the actual update operation count is greater than the max paid update operation count,
      // we will penalize the writer by not accepting any updates.
      const updateOperationCount = provisionalIndexFile.didUniqueSuffixes.length;
      if (updateOperationCount > maxPaidUpdateOperationCount) {
        provisionalIndexFile.removeAllUpdateOperationReferences();
      }

      // If we find operations for the same DID between anchor and provisional index files,
      // we will penalize the writer by not accepting any updates.
      if (!ArrayMethods.areMutuallyExclusive(coreIndexFile.didUniqueSuffixes, provisionalIndexFile.didUniqueSuffixes)) {
        provisionalIndexFile.removeAllUpdateOperationReferences();
      }

      return provisionalIndexFile;
    } catch (error) {
      if (error instanceof SidetreeError) {
        // If error is related to CAS network issues, we will surface them so retry can happen.
        if (error.code === ErrorCode.CasNotReachable ||
            error.code === ErrorCode.CasFileNotFound) {
          throw error;
        }

        return undefined;
      } else {
        const errorString = SidetreeError.stringify(error);
        console.error(
          `Unexpected error fetching provisional index file ${coreIndexFile.model.provisionalIndexFileUri}, MUST investigate and fix: ${errorString}`
        );
        return undefined;
      }
    }
  }

  /**
   * NOTE: In order to be forward-compatible with data-pruning feature,
   * we must continue to process the operations declared in the core index file even if the map/chunk file is invalid.
   * This means that this method MUST ONLY throw errors that are retry-able (e.g. network or file not found errors),
   * It is a design choice to hide the complexity of chunk file downloading and construction within this method,
   * instead of throwing errors and letting the caller handle them.
   * @returns `ChunkFileModel` if downloaded file is valid; `undefined` otherwise.
   * @throws SidetreeErrors that are retry-able.
   */
  private async downloadAndVerifyChunkFile (
    provisionalIndexFile: ProvisionalIndexFile | undefined
  ): Promise<ChunkFileModel | undefined> {
    // Can't download chunk file if provisional index file is not given.
    if (provisionalIndexFile === undefined) {
      return undefined;
    }

    let chunkFileHash;
    try {
      chunkFileHash = provisionalIndexFile.model.chunks[0].chunkFileUri;
      console.info(`Downloading chunk file '${chunkFileHash}', max size limit ${ProtocolParameters.maxChunkFileSizeInBytes}...`);

      const fileBuffer = await this.downloadFileFromCas(chunkFileHash, ProtocolParameters.maxChunkFileSizeInBytes);
      const chunkFileModel = await ChunkFile.parse(fileBuffer);

      return chunkFileModel;
    } catch (error) {
      if (error instanceof SidetreeError) {
        // If error is related to CAS network issues, we will surface them so retry can happen.
        if (error.code === ErrorCode.CasNotReachable ||
            error.code === ErrorCode.CasFileNotFound) {
          throw error;
        }

        return undefined;
      } else {
        console.error(`Unexpected error fetching chunk file ${chunkFileHash}, MUST investigate and fix: ${SidetreeError.stringify(error)}`);
        return undefined;
      }
    }
  }

  private async composeAnchoredOperationModels (
    transaction: TransactionModel,
    coreIndexFile: CoreIndexFile,
    provisionalIndexFile: ProvisionalIndexFile | undefined,
    coreProofFile: CoreProofFile | undefined,
    provisionalProofFile: ProvisionalProofFile | undefined,
    chunkFile: ChunkFileModel | undefined
  ): Promise<AnchoredOperationModel[]> {

    // TODO: #766 - Handle combinations of different availability of files here.

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

    const deactivateDidSuffixes = coreIndexFile.didUniqueSuffixes;
    const deactivateProofs = coreProofFile.deactivateProofs.map((proof) => proof.signedDataJws.toCompactJws());

    const anchoredOperationModels = [];
    for (let i = 0; i < deactivateDidSuffixes.length; i++) {
      // Compose the original operation request from the files.
      const composedRequest = {
        type: OperationType.Deactivate,
        didSuffix: deactivateDidSuffixes[i],
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

import AnchorFile from './AnchorFile';
import AnchoredDataSerializer from './AnchoredDataSerializer';
import AnchoredOperationModel from '../../models/AnchoredOperationModel';
import ArrayMethods from './util/ArrayMethods';
import ChunkFile from './ChunkFile';
import ChunkFileModel from './models/ChunkFileModel';
import CoreProofFile from './CoreProofFile';
import DownloadManager from '../../DownloadManager';
import ErrorCode from './ErrorCode';
import FeeManager from './FeeManager';
import FetchResultCode from '../../../common/enums/FetchResultCode';
import IBlockchain from '../../interfaces/IBlockchain';
import IOperationStore from '../../interfaces/IOperationStore';
import ITransactionProcessor from '../../interfaces/ITransactionProcessor';
import IVersionMetadataFetcher from '../../interfaces/IVersionMetadataFetcher';
import JsonAsync from './util/JsonAsync';
import LogColor from '../../../common/LogColor';
import MapFile from './MapFile';
import OperationType from '../../enums/OperationType';
import ProtocolParameters from './ProtocolParameters';
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
      FeeManager.verifyTransactionFeeAndThrowOnError(transaction.transactionFeePaid, anchoredData.numberOfOperations, transaction.normalizedTransactionFee);

      // Download and verify anchor file.
      const anchorFile = await this.downloadAndVerifyAnchorFile(transaction, anchoredData.anchorFileHash, anchoredData.numberOfOperations);

      // Download and verify map file.
      const mapFile = await this.downloadAndVerifyMapFile(anchorFile, anchoredData.numberOfOperations);

      // Download and verify core proof file.
      const coreProofFile = await this.downloadAndVerifyCoreProofFile(anchorFile);

      // Download and verify provisional proof file.
      const provisionalProofFile = await this.downloadAndVerifyProvisionalProofFile(mapFile);

      // Download and verify chunk file.
      const chunkFileModel = await this.downloadAndVerifyChunkFile(mapFile);

      // Compose into operations from all the files downloaded.
      const operations = await this.composeAnchoredOperationModels(transaction, anchorFile, mapFile, coreProofFile, provisionalProofFile, chunkFileModel);

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
      paidOperationCount,
      transaction.transactionTime,
      transaction.writer,
      this.versionMetadataFetcher);

    return anchorFile;
  }

  private async downloadAndVerifyCoreProofFile (anchorFile: AnchorFile): Promise<CoreProofFile | undefined> {
    const coreProofFileUri = anchorFile.model.coreProofFileUri;
    if (coreProofFileUri === undefined) {
      return;
    }

    console.info(`Downloading core proof file '${coreProofFileUri}', max file size limit ${ProtocolParameters.maxProofFileSizeInBytes}...`);

    const fileBuffer = await this.downloadFileFromCas(coreProofFileUri, ProtocolParameters.maxProofFileSizeInBytes);
    const coreProofFile = await CoreProofFile.parse(fileBuffer, anchorFile.deactivateDidSuffixes);

    const recoverAndDeactivateCount = anchorFile.deactivateDidSuffixes.length + anchorFile.recoverDidSuffixes.length;
    const proofCountInCoreProofFile = coreProofFile.deactivateProofs.length + coreProofFile.recoverProofs.length;
    if (recoverAndDeactivateCount !== proofCountInCoreProofFile) {
      throw new SidetreeError(
        ErrorCode.CoreProofFileProofCountNotTheSameAsOperationCountInAnchorFile,
        `Proof count of ${proofCountInCoreProofFile} in core proof file different to recover + deactivate count of ${recoverAndDeactivateCount} in anchor file.`
      );
    }

    return coreProofFile;
  }

  private async downloadAndVerifyProvisionalProofFile (mapFile: MapFile | undefined): Promise<ProvisionalProofFile | undefined> {
    // If there is no provisional proof file to download, just return.
    if (mapFile === undefined || mapFile.model.provisionalProofFileUri === undefined) {
      return;
    }

    const provisionalProofFileUri = mapFile.model.provisionalProofFileUri;
    console.info(`Downloading provisional proof file '${provisionalProofFileUri}', max file size limit ${ProtocolParameters.maxProofFileSizeInBytes}...`);

    const fileBuffer = await this.downloadFileFromCas(provisionalProofFileUri, ProtocolParameters.maxProofFileSizeInBytes);
    const provisionalProofFile = await ProvisionalProofFile.parse(fileBuffer);

    const operationCountInMapFile = mapFile.didUniqueSuffixes.length;
    const proofCountInProvisionalProofFile = provisionalProofFile.updateProofs.length;
    if (operationCountInMapFile !== proofCountInProvisionalProofFile) {
      throw new SidetreeError(
        ErrorCode.ProvisionalProofFileProofCountNotTheSameAsOperationCountInMapFile,
        `Proof count ${proofCountInProvisionalProofFile} in provisional proof file is different from operation count ${operationCountInMapFile} in map file.`
      );
    }

    return provisionalProofFile;
  }

  /**
   * NOTE: In order to be forward-compatible with data-pruning feature,
   * we must continue to process the operations declared in the anchor file even if the map/chunk file is invalid.
   * This means that this method MUST ONLY throw errors that are retry-able (e.g. network or file not found errors),
   * It is a design choice to hide the complexity of map file downloading and construction within this method,
   * instead of throwing errors and letting the caller handle them.
   * @returns `MapFile` if downloaded file is valid; `undefined` otherwise.
   * @throws SidetreeErrors that are retry-able.
   */
  private async downloadAndVerifyMapFile (anchorFile: AnchorFile, paidOperationCount: number): Promise<MapFile | undefined> {
    try {
      const anchorFileModel = anchorFile.model;

      // If no map file URI is defined (legitimate case when there is only deactivates in the operation batch), then no map file to download.
      if (anchorFileModel.mapFileUri === undefined) {
        return undefined;
      }

      console.info(`Downloading map file '${anchorFileModel.mapFileUri}', max file size limit ${ProtocolParameters.maxMapFileSizeInBytes}...`);

      const fileBuffer = await this.downloadFileFromCas(anchorFileModel.mapFileUri, ProtocolParameters.maxMapFileSizeInBytes);
      const mapFile = await MapFile.parse(fileBuffer);

      // Calculate the max paid update operation count.
      const operationCountInAnchorFile = anchorFile.didUniqueSuffixes.length;
      const maxPaidUpdateOperationCount = paidOperationCount - operationCountInAnchorFile;

      // If the actual update operation count is greater than the max paid update operation count,
      // we will penalize the writer by not accepting any updates.
      const updateOperationCount = mapFile.didUniqueSuffixes.length;
      if (updateOperationCount > maxPaidUpdateOperationCount) {
        mapFile.removeAllUpdateOperationReferences();
      }

      // If we find operations for the same DID between anchor and map files,
      // we will penalize the writer by not accepting any updates.
      if (!ArrayMethods.areMutuallyExclusive(anchorFile.didUniqueSuffixes, mapFile.didUniqueSuffixes)) {
        mapFile.removeAllUpdateOperationReferences();
      }

      return mapFile;
    } catch (error) {
      if (error instanceof SidetreeError) {
        // If error is related to CAS network issues, we will surface them so retry can happen.
        if (error.code === ErrorCode.CasNotReachable ||
            error.code === ErrorCode.CasFileNotFound) {
          throw error;
        }

        return undefined;
      } else {
        console.error(`Unexpected error fetching map file ${anchorFile.model.mapFileUri}, MUST investigate and fix: ${SidetreeError.stringify(error)}`);
        return undefined;
      }
    }
  }

  /**
   * NOTE: In order to be forward-compatible with data-pruning feature,
   * we must continue to process the operations declared in the anchor file even if the map/chunk file is invalid.
   * This means that this method MUST ONLY throw errors that are retry-able (e.g. network or file not found errors),
   * It is a design choice to hide the complexity of chunk file downloading and construction within this method,
   * instead of throwing errors and letting the caller handle them.
   * @returns `ChunkFileModel` if downloaded file is valid; `undefined` otherwise.
   * @throws SidetreeErrors that are retry-able.
   */
  private async downloadAndVerifyChunkFile (
    mapFile: MapFile | undefined
  ): Promise<ChunkFileModel | undefined> {
    // Can't download chunk file if map file is not given.
    if (mapFile === undefined) {
      return undefined;
    }

    let chunkFileHash;
    try {
      chunkFileHash = mapFile.model.chunks[0].chunkFileUri;
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
    anchorFile: AnchorFile,
    mapFile: MapFile | undefined,
    coreProofFile: CoreProofFile | undefined,
    provisionalProofFile: ProvisionalProofFile | undefined,
    chunkFile: ChunkFileModel | undefined
  ): Promise<AnchoredOperationModel[]> {

    // TODO: #766 - Handle combinations of different availability of files here.

    // TODO: #766 - Pending more PR for of remainder of the operation types.
    const createOperations = anchorFile.createOperations;

    // NOTE: this version of the protocol uses only ONE chunk file,
    // and operations must be ordered by types with the following order: create, recover, deactivate, update.
    const operations = [];
    operations.push(...createOperations);

    // NOTE: The last set of `operations` are deactivates, they don't have `delta` property.
    const anchoredOperationModels = [];
    for (let i = 0; i < operations.length; i++) {
      const operation = operations[i];
      const operationJsonString = operation.operationBuffer.toString();
      const operationObject = await JsonAsync.parse(operationJsonString);
      operationObject.type = operation.type;

      // Add `delta` property read from chunk file to each operation if chunk file exists.
      // NOTE: Deactivate operation does not have delta.
      if (chunkFile !== undefined &&
          operation.type !== OperationType.Deactivate) {
        operationObject.delta = chunkFile.deltas[i];
      }

      const patchedOperationBuffer = Buffer.from(JSON.stringify(operationObject));
      const anchoredOperationModel: AnchoredOperationModel = {
        didUniqueSuffix: operation.didUniqueSuffix,
        type: operation.type,
        operationBuffer: patchedOperationBuffer,
        operationIndex: i,
        transactionNumber: transaction.transactionNumber,
        transactionTime: transaction.transactionTime
      };

      anchoredOperationModels.push(anchoredOperationModel);
    }

    const anchoredRecoverOperationModels = TransactionProcessor.composeAnchoredRecoverOperationModels(
      transaction, anchorFile, coreProofFile!, chunkFile
    );

    const anchoredDeactivateOperationModels = TransactionProcessor.composeAnchoredDeactivateOperationModels(
      transaction, anchorFile, coreProofFile!
    );

    const anchoredUpdateOperationModels = TransactionProcessor.composeAnchoredUpdateOperationModels(
      transaction, anchorFile, mapFile, provisionalProofFile, chunkFile
    );

    anchoredOperationModels.push(...anchoredRecoverOperationModels);
    anchoredOperationModels.push(...anchoredDeactivateOperationModels);
    anchoredOperationModels.push(...anchoredUpdateOperationModels);
    return anchoredOperationModels;
  }

  private static composeAnchoredRecoverOperationModels (
    transaction: TransactionModel,
    anchorFile: AnchorFile,
    coreProofFile: CoreProofFile,
    chunkFile: ChunkFileModel | undefined
  ): AnchoredOperationModel[] {
    if (anchorFile.recoverDidSuffixes.length === 0) {
      return [];
    }

    let recoverDeltas;
    if (chunkFile !== undefined) {
      const recoverDeltaStartIndex = anchorFile.createOperations.length;
      recoverDeltas = chunkFile.deltas.slice(recoverDeltaStartIndex);
    }

    const recoverDidSuffixes = anchorFile.recoverDidSuffixes;
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
        operationIndex: anchorFile.createOperations.length + i,
        transactionNumber: transaction.transactionNumber,
        transactionTime: transaction.transactionTime
      };

      anchoredOperationModels.push(anchoredOperationModel);
    }

    return anchoredOperationModels;
  }

  private static composeAnchoredDeactivateOperationModels (
    transaction: TransactionModel,
    anchorFile: AnchorFile,
    coreProofFile: CoreProofFile
  ): AnchoredOperationModel[] {
    if (anchorFile.deactivateDidSuffixes.length === 0) {
      return [];
    }

    const deactivateDidSuffixes = anchorFile.didUniqueSuffixes;
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
        operationIndex: anchorFile.createOperations.length + anchorFile.recoverDidSuffixes.length + i,
        transactionNumber: transaction.transactionNumber,
        transactionTime: transaction.transactionTime
      };

      anchoredOperationModels.push(anchoredOperationModel);
    }

    return anchoredOperationModels;
  }

  private static composeAnchoredUpdateOperationModels (
    transaction: TransactionModel,
    anchorFile: AnchorFile,
    mapFile: MapFile | undefined,
    provisionalProofFile: ProvisionalProofFile | undefined,
    chunkFile: ChunkFileModel | undefined
  ): AnchoredOperationModel[] {
    // If map file is undefined (in the case of batch containing only deactivates) or
    // if map file's update operation reference count is zero (in the case of batch containing creates and/or recovers).
    if (mapFile === undefined ||
        mapFile.didUniqueSuffixes.length === 0) {
      return [];
    }

    let updateDeltas;
    if (chunkFile !== undefined) {
      const updateDeltaStartIndex = anchorFile.createOperations.length + anchorFile.recoverDidSuffixes.length;
      updateDeltas = chunkFile!.deltas.slice(updateDeltaStartIndex);
    }

    const updateDidSuffixes = mapFile.didUniqueSuffixes;
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
        operationIndex: anchorFile.didUniqueSuffixes.length + i,
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

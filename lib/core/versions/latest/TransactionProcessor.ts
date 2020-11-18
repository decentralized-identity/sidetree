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
    const coreProofFile = await CoreProofFile.parse(fileBuffer, anchorFile.deactivateOperations.map(operation => operation.didUniqueSuffix));

    const recoverAndDeactivateCount = anchorFile.deactivateOperations.length + anchorFile.recoverOperations.length;
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
      console.info(`Downloading map file '${anchorFileModel.mapFileUri}', max file size limit ${ProtocolParameters.maxMapFileSizeInBytes}...`);

      const fileBuffer = await this.downloadFileFromCas(anchorFileModel.mapFileUri, ProtocolParameters.maxMapFileSizeInBytes);
      const mapFile = await MapFile.parse(fileBuffer);

      // Calculate the max paid update operation count.
      const operationCountInAnchorFile = anchorFile.didUniqueSuffixes.length;
      const maxPaidUpdateOperationCount = paidOperationCount - operationCountInAnchorFile;

      // If the actual update operation count is greater than the max paid update operation count, the map file is invalid.
      const updateOperationCount = mapFile.updateOperations ? mapFile.updateOperations.length : 0;
      if (updateOperationCount > maxPaidUpdateOperationCount) {
        return undefined;
      }

      // If we find operations for the same DID between anchor and map files, the map file is invalid.
      if (!ArrayMethods.areMutuallyExclusive(anchorFile.didUniqueSuffixes, mapFile.didUniqueSuffixes)) {
        return undefined;
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

    const createOperations = anchorFile.createOperations;
    const recoverOperations = anchorFile.recoverOperations;
    const deactivateOperations = anchorFile.deactivateOperations;
    const updateOperations = (mapFile && mapFile.updateOperations) ? mapFile.updateOperations : [];

    // Add the operations in the following order of types: create, recover, update, deactivate.
    const operations = [];
    operations.push(...createOperations);
    operations.push(...recoverOperations);
    operations.push(...updateOperations);
    operations.push(...deactivateOperations);

    // TODO: Issue 442 - https://github.com/decentralized-identity/sidetree/issues/442
    // Use actual operation request object instead of buffer.

    // Prepare proofs to compose the original operation requests.
    const proofs: (string | undefined)[] = createOperations.map(() => undefined); // Creates do not have proofs.
    if (coreProofFile !== undefined) {
      const recoverProofs = coreProofFile.recoverProofs.map((proof) => proof.signedDataJws.toCompactJws());
      const deactivateProofs = coreProofFile.deactivateProofs.map((proof) => proof.signedDataJws.toCompactJws());
      proofs.push(...recoverProofs);
      proofs.push(...deactivateProofs);
    }
    if (provisionalProofFile !== undefined) {
      const updateProofs = provisionalProofFile.updateProofs.map((proof) => proof.signedDataJws.toCompactJws());
      proofs.push(...updateProofs);
    }

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

      // Add the `signedData` property unless it is a create operation.
      if (operation.type !== OperationType.Create) {
        operationObject.signedData = proofs[i];
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

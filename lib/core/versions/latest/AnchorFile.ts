import AnchorFileModel from './models/AnchorFileModel';
import ArrayMethods from './util/ArrayMethods';
import Compressor from './util/Compressor';
import CreateOperation from './CreateOperation';
import DeactivateOperation from './DeactivateOperation';
import ErrorCode from './ErrorCode';
import JsonAsync from './util/JsonAsync';
import ProtocolParameters from './ProtocolParameters';
import RecoverOperation from './RecoverOperation';
import SidetreeError from '../../../common/SidetreeError';
import InputValidator from './InputValidator';

/**
 * Class containing Anchor File related operations.
 */
export default class AnchorFile {

  /**
   * Class that represents an anchor file.
   * NOTE: this class is introduced as an internal structure in replacement to `AnchorFileModel`
   * to keep useful metadata so that repeated computation can be avoided.
   */
  private constructor (
    public readonly model: AnchorFileModel,
    public readonly didUniqueSuffixes: string[],
    public readonly createOperations: CreateOperation[],
    public readonly recoverOperations: RecoverOperation[],
    public readonly deactivateOperations: DeactivateOperation[]) { }

  /**
   * Parses and validates the given anchor file buffer.
   * @throws `SidetreeError` if failed parsing or validation.
   */
  public static async parse (anchorFileBuffer: Buffer): Promise<AnchorFile> {

    let anchorFileDecompressedBuffer;
    try {
      const maxAllowedDecompressedSizeInBytes = ProtocolParameters.maxAnchorFileSizeInBytes * Compressor.estimatedDecompressionMultiplier;
      anchorFileDecompressedBuffer = await Compressor.decompress(anchorFileBuffer, maxAllowedDecompressedSizeInBytes);
    } catch (e) {
      throw SidetreeError.createFromError(ErrorCode.AnchorFileDecompressionFailure, e);
    }

    let anchorFileModel;
    try {
      anchorFileModel = await JsonAsync.parse(anchorFileDecompressedBuffer);
    } catch (e) {
      throw SidetreeError.createFromError(ErrorCode.AnchorFileNotJson, e);
    }

    const allowedProperties = new Set(['mapFileUri', 'coreProofFileUri', 'operations', 'writerLockId']);
    for (const property in anchorFileModel) {
      if (!allowedProperties.has(property)) {
        throw new SidetreeError(ErrorCode.AnchorFileHasUnknownProperty);
      }
    }

    if (!('mapFileUri' in anchorFileModel)) {
      throw new SidetreeError(ErrorCode.AnchorFileMapFileUriMissing);
    }

    if (!('operations' in anchorFileModel)) {
      throw new SidetreeError(ErrorCode.AnchorFileMissingOperationsProperty);
    }

    // `writerLockId` validations.
    if (('writerLockId' in anchorFileModel)) {
      if (typeof anchorFileModel.writerLockId !== 'string') {
        throw new SidetreeError(ErrorCode.AnchorFileWriterLockIdPropertyNotString);
      }

      AnchorFile.validateWriterLockId(anchorFileModel.writerLockId);
    }

    // Map file URI validations.
    const mapFileUri = anchorFileModel.mapFileUri;
    InputValidator.validateCasFileUri(mapFileUri, 'map file URI');

    // `operations` validations.

    const allowedOperationsProperties = new Set(['create', 'recover', 'deactivate']);
    const operations = anchorFileModel.operations;
    for (const property in operations) {
      if (!allowedOperationsProperties.has(property)) {
        throw new SidetreeError(ErrorCode.AnchorFileUnexpectedPropertyInOperations, `Unexpected property ${property} in 'operations' property in anchor file.`);
      }
    }

    // Will be populated for later validity check.
    const didUniqueSuffixes: string[] = [];

    // Validate `create` if exists.
    const createOperations: CreateOperation[] = [];
    if (operations.create !== undefined) {
      if (!Array.isArray(operations.create)) {
        throw new SidetreeError(ErrorCode.AnchorFileCreatePropertyNotArray);
      }

      // Validate every create operation.
      for (const operation of operations.create) {
        const createOperation = await CreateOperation.parseOperationFromAnchorFile(operation);
        createOperations.push(createOperation);
        didUniqueSuffixes.push(createOperation.didUniqueSuffix);
      }
    }

    // Validate `recover` if exists.
    const recoverOperations: RecoverOperation[] = [];
    if (operations.recover !== undefined) {
      if (!Array.isArray(operations.recover)) {
        throw new SidetreeError(ErrorCode.AnchorFileRecoverPropertyNotArray);
      }

      // Validate every recover operation.
      for (const operation of operations.recover) {
        const recoverOperation = await RecoverOperation.parseOperationFromAnchorFile(operation);
        recoverOperations.push(recoverOperation);
        didUniqueSuffixes.push(recoverOperation.didUniqueSuffix);
      }
    }

    // Validate `deactivate` if exists.
    const deactivateOperations: DeactivateOperation[] = [];
    if (operations.deactivate !== undefined) {
      if (!Array.isArray(operations.deactivate)) {
        throw new SidetreeError(ErrorCode.AnchorFileDeactivatePropertyNotArray);
      }

      // Validate every operation.
      for (const operation of operations.deactivate) {
        const deactivateOperation = await DeactivateOperation.parseOperationFromAnchorFile(operation);
        deactivateOperations.push(deactivateOperation);
        didUniqueSuffixes.push(deactivateOperation.didUniqueSuffix);
      }
    }

    if (ArrayMethods.hasDuplicates(didUniqueSuffixes)) {
      throw new SidetreeError(ErrorCode.AnchorFileMultipleOperationsForTheSameDid);
    }

    // Validate core proof file URI.
    if (recoverOperations.length > 0 || deactivateOperations.length > 0) {
      InputValidator.validateCasFileUri(anchorFileModel.coreProofFileUri, 'core proof file URI');
    } else {
      if (anchorFileModel.coreProofFileUri !== undefined) {
        throw new SidetreeError(
          ErrorCode.AnchorFileCoreProofFileUriNotAllowed,
          `Core proof file '${anchorFileModel.coreProofFileUri}' not allowed in an anchor file with no recovers and deactivates.`
        );
      }
    }

    const anchorFile = new AnchorFile(anchorFileModel, didUniqueSuffixes, createOperations, recoverOperations, deactivateOperations);
    return anchorFile;
  }

  /**
   * Creates an `AnchorFileModel`.
   */
  public static async createModel (
    writerLockId: string | undefined,
    mapFileHash: string,
    coreProofFileHash: string | undefined,
    createOperationArray: CreateOperation[],
    recoverOperationArray: RecoverOperation[],
    deactivateOperationArray: DeactivateOperation[]
  ): Promise<AnchorFileModel> {

    if (writerLockId !== undefined) {
      AnchorFile.validateWriterLockId(writerLockId);
    }

    const createOperations = createOperationArray.map(operation => {
      return {
        suffixData: {
          deltaHash: operation.suffixData.deltaHash,
          recoveryCommitment: operation.suffixData.recoveryCommitment,
          type: operation.suffixData.type
        }
      };
    });

    const recoverOperations = recoverOperationArray.map(operation => {
      return {
        didSuffix: operation.didUniqueSuffix,
        signedData: operation.signedDataJws.toCompactJws()
      };
    });

    const deactivateOperations = deactivateOperationArray.map(operation => {
      return {
        didSuffix: operation.didUniqueSuffix,
        signedData: operation.signedDataJws.toCompactJws()
      };
    });

    const anchorFileModel = {
      writerLockId,
      mapFileUri: mapFileHash,
      coreProofFileUri: coreProofFileHash,
      operations: {
        create: createOperations,
        recover: recoverOperations,
        deactivate: deactivateOperations
      }
    };

    // Only insert `coreProofFileUri` property if a value is given.
    if (coreProofFileHash !== undefined) {
      anchorFileModel.coreProofFileUri = coreProofFileHash;
    }

    return anchorFileModel;
  }

  /**
   * Creates an anchor file buffer.
   */
  public static async createBuffer (
    writerLockId: string | undefined,
    mapFileHash: string,
    coreProofFileHash: string | undefined,
    createOperations: CreateOperation[],
    recoverOperations: RecoverOperation[],
    deactivateOperations: DeactivateOperation[]
  ): Promise<Buffer> {
    const anchorFileModel = await AnchorFile.createModel(
      writerLockId, mapFileHash, coreProofFileHash, createOperations, recoverOperations, deactivateOperations
    );
    const anchorFileJson = JSON.stringify(anchorFileModel);
    const anchorFileBuffer = Buffer.from(anchorFileJson);

    return Compressor.compress(anchorFileBuffer);
  }

  private static validateWriterLockId (writerLockId: string) {
    // Max size check.
    const writerLockIdSizeInBytes = Buffer.from(writerLockId).length;
    if (writerLockIdSizeInBytes > ProtocolParameters.maxWriterLockIdInBytes) {
      throw new SidetreeError(
        ErrorCode.AnchorFileWriterLockIdExceededMaxSize,
        `Writer lock ID of ${writerLockIdSizeInBytes} bytes exceeded the maximum size of ${ProtocolParameters.maxWriterLockIdInBytes} bytes.`
      );
    }
  }
}

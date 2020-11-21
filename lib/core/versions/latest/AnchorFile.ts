import AnchorFileModel from './models/AnchorFileModel';
import ArrayMethods from './util/ArrayMethods';
import Compressor from './util/Compressor';
import CreateOperation from './CreateOperation';
import DeactivateOperation from './DeactivateOperation';
import ErrorCode from './ErrorCode';
import InputValidator from './InputValidator';
import JsonAsync from './util/JsonAsync';
import Multihash from './Multihash';
import OperationReferenceModel from './models/OperationReferenceModel';
import ProtocolParameters from './ProtocolParameters';
import RecoverOperation from './RecoverOperation';
import SidetreeError from '../../../common/SidetreeError';

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
    public readonly recoverDidSuffixes: string[],
    public readonly deactivateDidSuffixes: string[]) { }

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

    // TODO: #631 - If `operations` does not exist, then `mapFileUri` MUST exist. ie. There must be at least one operation in a batch.
    // TODO: #631 - If `mapFileUri` does not exist, then `operations` MUST have just deactivates. ie. non-deactivates have delta in chunk file.

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
    let recoverDidSuffixes: string[] = [];
    if (operations.recover !== undefined) {
      if (!Array.isArray(operations.recover)) {
        throw new SidetreeError(ErrorCode.AnchorFileRecoverPropertyNotArray);
      }

      // Validate every recover reference.
      InputValidator.validateOperationReferences(operations.recover, 'recover');
      recoverDidSuffixes = (operations.recover as OperationReferenceModel[]).map(operation => operation.didSuffix);
      didUniqueSuffixes.push(...recoverDidSuffixes);
    }

    // Validate `deactivate` if exists.
    let deactivateDidSuffixes: string[] = [];
    if (operations.deactivate !== undefined) {
      if (!Array.isArray(operations.deactivate)) {
        throw new SidetreeError(ErrorCode.AnchorFileDeactivatePropertyNotArray);
      }

      // Validate every deactivate reference.
      InputValidator.validateOperationReferences(operations.deactivate, 'deactivate');
      deactivateDidSuffixes = (operations.deactivate as OperationReferenceModel[]).map(operation => operation.didSuffix);
      didUniqueSuffixes.push(...deactivateDidSuffixes);
    }

    if (ArrayMethods.hasDuplicates(didUniqueSuffixes)) {
      throw new SidetreeError(ErrorCode.AnchorFileMultipleOperationsForTheSameDid);
    }

    // Validate core proof file URI.
    if (recoverDidSuffixes.length > 0 || deactivateDidSuffixes.length > 0) {
      InputValidator.validateCasFileUri(anchorFileModel.coreProofFileUri, 'core proof file URI');
    } else {
      if (anchorFileModel.coreProofFileUri !== undefined) {
        throw new SidetreeError(
          ErrorCode.AnchorFileCoreProofFileUriNotAllowed,
          `Core proof file '${anchorFileModel.coreProofFileUri}' not allowed in an anchor file with no recovers and deactivates.`
        );
      }
    }

    const anchorFile = new AnchorFile(anchorFileModel, didUniqueSuffixes, createOperations, recoverDidSuffixes, deactivateDidSuffixes);
    return anchorFile;
  }

  /**
   * Creates an `AnchorFileModel`.
   */
  public static async createModel (
    writerLockId: string | undefined,
    mapFileUri: string | undefined,
    coreProofFileHash: string | undefined,
    createOperationArray: CreateOperation[],
    recoverOperationArray: RecoverOperation[],
    deactivateOperationArray: DeactivateOperation[]
  ): Promise<AnchorFileModel> {

    if (writerLockId !== undefined) {
      AnchorFile.validateWriterLockId(writerLockId);
    }

    const anchorFileModel: AnchorFileModel = {
      writerLockId,
      mapFileUri
    };

    // Only insert `operations` property if there is at least one operation reference.
    if (createOperationArray.length > 0 ||
        recoverOperationArray.length > 0 ||
        deactivateOperationArray.length > 0) {
      anchorFileModel.operations = { };
    }

    const createReferences = createOperationArray.map(operation => {
      return {
        suffixData: {
          deltaHash: operation.suffixData.deltaHash,
          recoveryCommitment: operation.suffixData.recoveryCommitment,
          type: operation.suffixData.type
        }
      };
    });

    // Only insert `recover` property if there are create operation references.
    if (createReferences.length > 0) {
      anchorFileModel.operations!.create = createReferences;
    }

    const recoverReferences = recoverOperationArray.map(operation => {
      const revealValue = Multihash.canonicalizeThenHashThenEncode(operation.signedData.recoveryKey);

      return { didSuffix: operation.didUniqueSuffix, revealValue };
    });

    // Only insert `recover` property if there are recover operation references.
    if (recoverReferences.length > 0) {
      anchorFileModel.operations!.recover = recoverReferences;
    }

    const deactivateReferences = deactivateOperationArray.map(operation => {
      const revealValue = Multihash.canonicalizeThenHashThenEncode(operation.signedData.recoveryKey);

      return { didSuffix: operation.didUniqueSuffix, revealValue };
    });

    // Only insert `recover` property if there are deactivate operation references.
    if (deactivateReferences.length > 0) {
      anchorFileModel.operations!.deactivate = deactivateReferences;
    }

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
    mapFileUri: string | undefined,
    coreProofFileHash: string | undefined,
    createOperations: CreateOperation[],
    recoverOperations: RecoverOperation[],
    deactivateOperations: DeactivateOperation[]
  ): Promise<Buffer> {
    const anchorFileModel = await AnchorFile.createModel(
      writerLockId, mapFileUri, coreProofFileHash, createOperations, recoverOperations, deactivateOperations
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

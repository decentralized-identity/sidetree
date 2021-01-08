import ArrayMethods from './util/ArrayMethods';
import Compressor from './util/Compressor';
import CoreIndexFileModel from './models/CoreIndexFileModel';
import CreateOperation from './CreateOperation';
import DeactivateOperation from './DeactivateOperation';
import Did from './Did';
import ErrorCode from './ErrorCode';
import InputValidator from './InputValidator';
import JsonAsync from './util/JsonAsync';
import OperationReferenceModel from './models/OperationReferenceModel';
import ProtocolParameters from './ProtocolParameters';
import RecoverOperation from './RecoverOperation';
import SidetreeError from '../../../common/SidetreeError';
import SuffixDataModel from './models/SuffixDataModel';

/**
 * Create reference model internally used in a core index file.
 */
interface CreateReferenceModel {
  suffixData: SuffixDataModel
}

/**
 * Class containing Core Index File related operations.
 */
export default class CoreIndexFile {

  /**
   * Class that represents an core index file.
   * NOTE: this class is introduced as an internal structure in replacement to `CoreIndexFileModel`
   * to keep useful metadata so that repeated computation can be avoided.
   */
  private constructor (
    public readonly model: CoreIndexFileModel,
    public readonly didUniqueSuffixes: string[],
    public readonly createDidSuffixes: string[],
    public readonly recoverDidSuffixes: string[],
    public readonly deactivateDidSuffixes: string[]) { }

  /**
   * Parses and validates the given core index file buffer.
   * @throws `SidetreeError` if failed parsing or validation.
   */
  public static async parse (coreIndexFileBuffer: Buffer): Promise<CoreIndexFile> {

    let coreIndexFileDecompressedBuffer;
    try {
      const maxAllowedDecompressedSizeInBytes = ProtocolParameters.maxCoreIndexFileSizeInBytes * Compressor.estimatedDecompressionMultiplier;
      coreIndexFileDecompressedBuffer = await Compressor.decompress(coreIndexFileBuffer, maxAllowedDecompressedSizeInBytes);
    } catch (e) {
      throw SidetreeError.createFromError(ErrorCode.CoreIndexFileDecompressionFailure, e);
    }

    let coreIndexFileModel;
    try {
      coreIndexFileModel = await JsonAsync.parse(coreIndexFileDecompressedBuffer);
    } catch (e) {
      throw SidetreeError.createFromError(ErrorCode.CoreIndexFileNotJson, e);
    }

    const allowedProperties = new Set(['provisionalIndexFileUri', 'coreProofFileUri', 'operations', 'writerLockId']);
    for (const property in coreIndexFileModel) {
      if (!allowedProperties.has(property)) {
        throw new SidetreeError(ErrorCode.CoreIndexFileHasUnknownProperty);
      }
    }

    // `writerLockId` validations.
    if (('writerLockId' in coreIndexFileModel)) {
      if (typeof coreIndexFileModel.writerLockId !== 'string') {
        throw new SidetreeError(ErrorCode.CoreIndexFileWriterLockIdPropertyNotString);
      }

      CoreIndexFile.validateWriterLockId(coreIndexFileModel.writerLockId);
    }

    // `operations` validations.
    let operations: any = { };
    if ('operations' in coreIndexFileModel) {
      operations = coreIndexFileModel.operations;
    }

    const allowedOperationsProperties = new Set(['create', 'recover', 'deactivate']);
    for (const property in operations) {
      if (!allowedOperationsProperties.has(property)) {
        throw new SidetreeError(
          ErrorCode.CoreIndexFileUnexpectedPropertyInOperations,
          `Unexpected property ${property} in 'operations' property in core index file.`
        );
      }
    }

    // Will be populated for later validity check.
    const didUniqueSuffixes: string[] = [];

    // Validate `create` if exists.
    let createDidSuffixes: string[] = [];
    if (operations.create !== undefined) {
      if (!Array.isArray(operations.create)) {
        throw new SidetreeError(ErrorCode.CoreIndexFileCreatePropertyNotArray);
      }

      // Validate every create reference.
      CoreIndexFile.validateCreateReferences(operations.create);
      createDidSuffixes = (operations.create as CreateReferenceModel[]).map(operation => Did.computeUniqueSuffix(operation.suffixData));
      didUniqueSuffixes.push(...createDidSuffixes);
    }

    // Validate `recover` if exists.
    let recoverDidSuffixes: string[] = [];
    if (operations.recover !== undefined) {
      if (!Array.isArray(operations.recover)) {
        throw new SidetreeError(ErrorCode.CoreIndexFileRecoverPropertyNotArray);
      }

      // Validate every recover reference.
      InputValidator.validateOperationReferences(operations.recover, 'recover reference');
      recoverDidSuffixes = (operations.recover as OperationReferenceModel[]).map(operation => operation.didSuffix);
      didUniqueSuffixes.push(...recoverDidSuffixes);
    }

    // Validate `deactivate` if exists.
    let deactivateDidSuffixes: string[] = [];
    if (operations.deactivate !== undefined) {
      if (!Array.isArray(operations.deactivate)) {
        throw new SidetreeError(ErrorCode.CoreIndexFileDeactivatePropertyNotArray);
      }

      // Validate every deactivate reference.
      InputValidator.validateOperationReferences(operations.deactivate, 'deactivate reference');
      deactivateDidSuffixes = (operations.deactivate as OperationReferenceModel[]).map(operation => operation.didSuffix);
      didUniqueSuffixes.push(...deactivateDidSuffixes);
    }

    if (ArrayMethods.hasDuplicates(didUniqueSuffixes)) {
      throw new SidetreeError(ErrorCode.CoreIndexFileMultipleOperationsForTheSameDid);
    }

    // If there is no operation reference in this file, then `provisionalIndexFileUri` MUST exist, because there must be at least one operation in a batch,
    // so this would imply that the operation reference must be in the provisional index file.

    // Map file URI validations.
    if (!('provisionalIndexFileUri' in coreIndexFileModel)) {
      // If `provisionalIndexFileUri` does not exist, then `operations` MUST have just deactivates. ie. only deactivates have no delta in chunk file.
      const createPlusRecoverOperationCount = createDidSuffixes.length + recoverDidSuffixes.length;
      if (createPlusRecoverOperationCount !== 0) {
        throw new SidetreeError(
          ErrorCode.CoreIndexFileProvisionalIndexFileUriMissing,
          `Provisional index file URI must exist since there are ${createDidSuffixes.length} creates and ${recoverDidSuffixes.length} recoveries.`
        );
      }
    } else {
      InputValidator.validateCasFileUri(coreIndexFileModel.provisionalIndexFileUri, 'provisional index file URI');
    }

    // Validate core proof file URI.
    if (recoverDidSuffixes.length > 0 || deactivateDidSuffixes.length > 0) {
      InputValidator.validateCasFileUri(coreIndexFileModel.coreProofFileUri, 'core proof file URI');
    } else {
      if (coreIndexFileModel.coreProofFileUri !== undefined) {
        throw new SidetreeError(
          ErrorCode.CoreIndexFileCoreProofFileUriNotAllowed,
          `Core proof file '${coreIndexFileModel.coreProofFileUri}' not allowed in an core index file with no recovers and deactivates.`
        );
      }
    }

    const coreIndexFile = new CoreIndexFile(coreIndexFileModel, didUniqueSuffixes, createDidSuffixes, recoverDidSuffixes, deactivateDidSuffixes);
    return coreIndexFile;
  }

  /**
   * Creates an `CoreIndexFileModel`.
   */
  public static async createModel (
    writerLockId: string | undefined,
    provisionalIndexFileUri: string | undefined,
    coreProofFileUri: string | undefined,
    createOperationArray: CreateOperation[],
    recoverOperationArray: RecoverOperation[],
    deactivateOperationArray: DeactivateOperation[]
  ): Promise<CoreIndexFileModel> {

    if (writerLockId !== undefined) {
      CoreIndexFile.validateWriterLockId(writerLockId);
    }

    const coreIndexFileModel: CoreIndexFileModel = {
      writerLockId,
      provisionalIndexFileUri
    };

    // Only insert `operations` property if there is at least one operation reference.
    if (createOperationArray.length > 0 ||
        recoverOperationArray.length > 0 ||
        deactivateOperationArray.length > 0) {
      coreIndexFileModel.operations = { };
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

    // Only insert `create` property if there are create operation references.
    if (createReferences.length > 0) {
      coreIndexFileModel.operations!.create = createReferences;
    }

    const recoverReferences = recoverOperationArray.map(operation => {
      const revealValue = operation.revealValue;
      return { didSuffix: operation.didUniqueSuffix, revealValue };
    });

    // Only insert `recover` property if there are recover operation references.
    if (recoverReferences.length > 0) {
      coreIndexFileModel.operations!.recover = recoverReferences;
    }

    const deactivateReferences = deactivateOperationArray.map(operation => {
      const revealValue = operation.revealValue;
      return { didSuffix: operation.didUniqueSuffix, revealValue };
    });

    // Only insert `deactivate` property if there are deactivate operation references.
    if (deactivateReferences.length > 0) {
      coreIndexFileModel.operations!.deactivate = deactivateReferences;
    }

    // Only insert `coreProofFileUri` property if a value is given.
    if (coreProofFileUri !== undefined) {
      coreIndexFileModel.coreProofFileUri = coreProofFileUri;
    }

    return coreIndexFileModel;
  }

  /**
   * Creates an core index file buffer.
   */
  public static async createBuffer (
    writerLockId: string | undefined,
    provisionalIndexFileUri: string | undefined,
    coreProofFileUri: string | undefined,
    createOperations: CreateOperation[],
    recoverOperations: RecoverOperation[],
    deactivateOperations: DeactivateOperation[]
  ): Promise<Buffer> {
    const coreIndexFileModel = await CoreIndexFile.createModel(
      writerLockId, provisionalIndexFileUri, coreProofFileUri, createOperations, recoverOperations, deactivateOperations
    );
    const coreIndexFileJson = JSON.stringify(coreIndexFileModel);
    const coreIndexFileBuffer = Buffer.from(coreIndexFileJson);

    return Compressor.compress(coreIndexFileBuffer);
  }

  private static validateWriterLockId (writerLockId: string) {
    // Max size check.
    const writerLockIdSizeInBytes = Buffer.from(writerLockId).length;
    if (writerLockIdSizeInBytes > ProtocolParameters.maxWriterLockIdInBytes) {
      throw new SidetreeError(
        ErrorCode.CoreIndexFileWriterLockIdExceededMaxSize,
        `Writer lock ID of ${writerLockIdSizeInBytes} bytes exceeded the maximum size of ${ProtocolParameters.maxWriterLockIdInBytes} bytes.`
      );
    }
  }

  /**
   * Validates the given create operation references.
   */
  private static validateCreateReferences (operationReferences: any[]) {
    for (const operationReference of operationReferences) {
      // Only `suffixData` is allowed.
      InputValidator.validateObjectContainsOnlyAllowedProperties(operationReference, ['suffixData'], `create operation reference`);
      InputValidator.validateSuffixData(operationReference.suffixData);
    }
  }
}

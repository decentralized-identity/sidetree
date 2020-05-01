import AnchorFileModel from './models/AnchorFileModel';
import ArrayMethods from './util/ArrayMethods';
import Compressor from './util/Compressor';
import CreateOperation from './CreateOperation';
import DeactivateOperation from './DeactivateOperation';
import Encoder from './Encoder';
import ErrorCode from './ErrorCode';
import JsonAsync from './util/JsonAsync';
import Multihash from './Multihash';
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
    public readonly recoverOperations: RecoverOperation[],
    public readonly deactivateOperations: DeactivateOperation[]) { }

  /**
   * Parses and validates the given anchor file buffer.
   * @throws `SidetreeError` if failed parsing or validation.
   */
  public static async parse (anchorFileBuffer: Buffer): Promise<AnchorFile> {

    let anchorFileDecompressedBuffer;
    try {
      anchorFileDecompressedBuffer = await Compressor.decompress(anchorFileBuffer);
    } catch (e) {
      throw SidetreeError.createFromError(ErrorCode.AnchorFileDecompressionFailure, e);
    }

    let anchorFileModel;
    try {
      anchorFileModel = await JsonAsync.parse(anchorFileDecompressedBuffer);
    } catch (e) {
      throw SidetreeError.createFromError(ErrorCode.AnchorFileNotJson, e);
    }

    const allowedProperties = new Set(['map_file_uri', 'operations', 'writer_lock_id']);
    for (let property in anchorFileModel) {
      if (!allowedProperties.has(property)) {
        throw new SidetreeError(ErrorCode.AnchorFileHasUnknownProperty);
      }
    }

    if (!anchorFileModel.hasOwnProperty('map_file_uri')) {
      throw new SidetreeError(ErrorCode.AnchorFileMapFileHashMissing);
    }

    if (!anchorFileModel.hasOwnProperty('operations')) {
      throw new SidetreeError(ErrorCode.AnchorFileMissingOperationsProperty);
    }

    if (anchorFileModel.hasOwnProperty('writer_lock_id') &&
        typeof anchorFileModel.writer_lock_id !== 'string') {
      throw new SidetreeError(ErrorCode.AnchorFileWriterLockIPropertyNotString);
    }

    // Map file hash validations.
    const mapFileUri = anchorFileModel.map_file_uri;
    if (typeof mapFileUri !== 'string') {
      throw new SidetreeError(ErrorCode.AnchorFileMapFileHashNotString);
    }

    const mapFileUriAsHashBuffer = Encoder.decodeAsBuffer(mapFileUri);
    if (!Multihash.isComputedUsingHashAlgorithm(mapFileUriAsHashBuffer, ProtocolParameters.hashAlgorithmInMultihashCode)) {
      throw new SidetreeError(ErrorCode.AnchorFileMapFileHashUnsupported, `Map file hash '${mapFileUri}' is unsupported.`);
    }

    // `operations` validations.

    const allowedOperationsProperties = new Set(['create', 'recover', 'deactivate']);
    const operations = anchorFileModel.operations;
    for (let property in operations) {
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

    const anchorFile = new AnchorFile(anchorFileModel, didUniqueSuffixes, createOperations, recoverOperations, deactivateOperations);
    return anchorFile;
  }

  /**
   * Creates an `AnchorFileModel`.
   */
  public static async createModel (
    writerLockId: string | undefined,
    mapFileHash: string,
    createOperationArray: CreateOperation[],
    recoverOperationArray: RecoverOperation[],
    deactivateOperationArray: DeactivateOperation[]
  ): Promise<AnchorFileModel> {

    const createOperations = createOperationArray.map(operation => {
      return {
        suffix_data: operation.encodedSuffixData
      };
    });

    const recoverOperations = recoverOperationArray.map(operation => {
      return {
        did_suffix: operation.didUniqueSuffix,
        recovery_reveal_value: operation.recoveryRevealValue,
        signed_data: operation.signedDataJws.toCompactJws()
      };
    });

    const deactivateOperations = deactivateOperationArray.map(operation => {
      return {
        did_suffix: operation.didUniqueSuffix,
        recovery_reveal_value: operation.recoveryRevealValue,
        signed_data: operation.signedDataJws.toCompactJws()
      };
    });

    const anchorFileModel = {
      writer_lock_id: writerLockId,
      map_file_uri: mapFileHash,
      operations: {
        create: createOperations,
        recover: recoverOperations,
        deactivate: deactivateOperations
      }
    };

    return anchorFileModel;
  }

  /**
   * Creates an anchor file buffer.
   */
  public static async createBuffer (
    writerLockId: string | undefined,
    mapFileHash: string,
    createOperations: CreateOperation[],
    recoverOperations: RecoverOperation[],
    deactivateOperations: DeactivateOperation[]
  ): Promise<Buffer> {
    const anchorFileModel = await AnchorFile.createModel(writerLockId, mapFileHash, createOperations, recoverOperations, deactivateOperations);
    const anchorFileJson = JSON.stringify(anchorFileModel);
    const anchorFileBuffer = Buffer.from(anchorFileJson);

    return Compressor.compress(anchorFileBuffer);
  }
}

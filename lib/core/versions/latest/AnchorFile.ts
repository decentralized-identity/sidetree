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

    const allowedProperties = new Set(['mapFileHash', 'operations', 'writerLockId']);
    for (let property in anchorFileModel) {
      if (!allowedProperties.has(property)) {
        throw new SidetreeError(ErrorCode.AnchorFileHasUnknownProperty);
      }
    }

    if (!anchorFileModel.hasOwnProperty('mapFileHash')) {
      throw new SidetreeError(ErrorCode.AnchorFileMapFileHashMissing);
    }

    if (!anchorFileModel.hasOwnProperty('operations')) {
      throw new SidetreeError(ErrorCode.AnchorFileMissingOperationsProperty);
    }

    if (anchorFileModel.hasOwnProperty('writerLockId') &&
        typeof anchorFileModel.writerLockId !== 'string') {
      throw new SidetreeError(ErrorCode.AnchorFileWriterLockIPropertyNotString);
    }

    // Map file hash validations.
    if (typeof anchorFileModel.mapFileHash !== 'string') {
      throw new SidetreeError(ErrorCode.AnchorFileMapFileHashNotString);
    }

    const didUniqueSuffixBuffer = Encoder.decodeAsBuffer(anchorFileModel.mapFileHash);
    if (!Multihash.isComputedUsingHashAlgorithm(didUniqueSuffixBuffer, ProtocolParameters.hashAlgorithmInMultihashCode)) {
      throw new SidetreeError(ErrorCode.AnchorFileMapFileHashUnsupported, `Map file hash '${anchorFileModel.mapFileHash}' is unsupported.`);
    }

    // `operations` validations.

    const allowedOperationsProperties = new Set(['createOperations', 'recoverOperations', 'deactivateOperations']);
    const operations = anchorFileModel.operations;
    for (let property in operations) {
      if (!allowedOperationsProperties.has(property)) {
        throw new SidetreeError(ErrorCode.AnchorFileUnexpectedPropertyInOperations, `Unexpected property ${property} in 'operations' property in anchor file.`);
      }
    }

    // Will be populated for later validity check.
    const didUniqueSuffixes: string[] = [];

    // Validate `createOperations` if exists.
    const createOperations: CreateOperation[] = [];
    if (operations.createOperations !== undefined) {
      if (!Array.isArray(operations.createOperations)) {
        throw new SidetreeError(ErrorCode.AnchorFileCreateOperationsNotArray);
      }

      // Validate every operation.
      for (const operation of operations.createOperations) {
        const createOperation = await CreateOperation.parseOpertionFromAnchorFile(operation);
        createOperations.push(createOperation);
        didUniqueSuffixes.push(createOperation.didUniqueSuffix);
      }
    }

    // Validate `recoverOperations` if exists.
    const recoverOperations: RecoverOperation[] = [];
    if (operations.recoverOperations !== undefined) {
      if (!Array.isArray(operations.recoverOperations)) {
        throw new SidetreeError(ErrorCode.AnchorFileRecoverOperationsNotArray);
      }

      // Validate every operation.
      for (const operation of operations.recoverOperations) {
        const recoverOperation = await RecoverOperation.parseOpertionFromAnchorFile(operation);
        recoverOperations.push(recoverOperation);
        didUniqueSuffixes.push(recoverOperation.didUniqueSuffix);
      }
    }

    // Validate `deactivateOperations` if exists.
    const deactivateOperations: DeactivateOperation[] = [];
    if (operations.deactivateOperations !== undefined) {
      if (!Array.isArray(operations.deactivateOperations)) {
        throw new SidetreeError(ErrorCode.AnchorFileDeactivateOperationsNotArray);
      }

      // Validate every operation.
      for (const operation of operations.deactivateOperations) {
        const deactivateOperation = await DeactivateOperation.parseOpertionFromAnchorFile(operation);
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
        suffixData: operation.encodedSuffixData
      };
    });

    const recoverOperations = recoverOperationArray.map(operation => {
      return {
        didUniqueSuffix: operation.didUniqueSuffix,
        recoveryRevealValue: operation,
        signedData: operation.signedDataJws.toJwsModel()
      };
    });

    const deactivateOperations = deactivateOperationArray.map(operation => {
      return {
        didUniqueSuffix: operation.didUniqueSuffix,
        recoveryRevealValue: operation.recoveryRevealValue,
        signedData: operation.signedDataJws.toJwsModel()
      };
    });

    const anchorFileModel = {
      writerLockId: writerLockId,
      mapFileHash,
      operations: {
        createOperations,
        recoverOperations,
        deactivateOperations
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

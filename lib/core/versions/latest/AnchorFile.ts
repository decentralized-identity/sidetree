import AnchorFileModel from './models/AnchorFileModel';
import ArrayMethods from './util/ArrayMethods';
import Compressor from './util/Compressor';
import CreateOperation from './CreateOperation';
import Encoder from './Encoder';
import ErrorCode from './ErrorCode';
import JsonAsync from './util/JsonAsync';
import Multihash from './Multihash';
import ProtocolParameters from './ProtocolParameters';
import RecoverOperation from './RecoverOperation';
import RevokeOperation from './RevokeOperation';
import SidetreeError from '../../../common/SidetreeError';

/**
 * Class containing Anchor File related operations.
 */
export default class AnchorFile {
  /**
   * Parses and validates the given anchor file buffer.
   * @throws `SidetreeError` if failed parsing or validation.
   */
  public static async parse (anchorFileBuffer: Buffer): Promise<AnchorFileModel> {

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

    const anchorFileProperties = Object.keys(anchorFileModel);
    if (anchorFileProperties.length > 2) {
      throw new SidetreeError(ErrorCode.AnchorFileHasUnknownProperty);
    }

    if (!anchorFileModel.hasOwnProperty('mapFileHash')) {
      throw new SidetreeError(ErrorCode.AnchorFileMapFileHashMissing);
    }

    if (!anchorFileModel.hasOwnProperty('operations')) {
      throw new SidetreeError(ErrorCode.AnchorFileMissingOperationsProperty);
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

    const allowedProperties = new Set(['createOperations', 'recoverOperations', 'revokeOperations']);
    const operations = anchorFileModel.operations;
    for (let property in operations) {
      if (!allowedProperties.has(property)) {
        throw new SidetreeError(ErrorCode.AnchorFileUnexpectedPropertyInOperations, `Unexpected property ${property} in 'operations' property in anchor file.`);
      }
    }

    // Will be populated for later validity check.
    const didUniqueSuffixes: string[] = [];

    // Validate `createOperations` if exists.
    if (operations.createOperations !== undefined) {
      if (!Array.isArray(operations.createOperations)) {
        throw new SidetreeError(ErrorCode.AnchorFileCreateOperationsNotArray);
      }

      // Validate every operation.
      for (const operation of operations.createOperations) {
        const createOperation = await CreateOperation.parseOpertionFromAnchorFile(operation);
        didUniqueSuffixes.push(createOperation.didUniqueSuffix);
      }
    }

    // Validate `recoverOperations` if exists.
    if (operations.recoverOperations !== undefined) {
      if (!Array.isArray(operations.recoverOperations)) {
        throw new SidetreeError(ErrorCode.AnchorFileRecoverOperationsNotArray);
      }

      // Validate every operation.
      for (const operation of operations.recoverOperations) {
        // TODO: Validate
        didUniqueSuffixes.push(operation.didUniqueSuffix);
      }
    }

    // Validate `revokeOperations` if exists.
    if (operations.revokeOperations !== undefined) {
      if (!Array.isArray(operations.revokeOperations)) {
        throw new SidetreeError(ErrorCode.AnchorFileRevokeOperationsNotArray);
      }

      // Validate every operation.
      for (const operation of operations.revokeOperations) {
        // TODO: Validate
        didUniqueSuffixes.push(operation.didUniqueSuffix);
      }
    }

    if (ArrayMethods.hasDuplicates(didUniqueSuffixes)) {
      throw new SidetreeError(ErrorCode.AnchorFileMultipleOperationsForTheSameDid);
    }

    return anchorFileModel;
  }

  /**
   * Creates an `AnchorFileModel`.
   */
  public static async createModel (
    mapFileHash: string,
    createOperationArray: CreateOperation[],
    recoverOperationArray: RecoverOperation[],
    revokeOperationArray: RevokeOperation[]
  ): Promise<AnchorFileModel> {

    const createOperations = createOperationArray.map(operation => {
      return {
        suffixData: operation.encodedSuffixData
      };
    });

    const recoverOperations = recoverOperationArray.map(operation => {
      return {
        didUniqueSuffix: operation.didUniqueSuffix,
        recoveryOtp: operation,
        signedOperationData: operation.signedOperationDataJws.toJwsModel()
      };
    });

    const revokeOperations = revokeOperationArray.map(operation => {
      return {
        didUniqueSuffix: operation.didUniqueSuffix,
        recoveryOtp: operation.recoveryOtp,
        signedOperationData: operation.signedOperationDataJws.toJwsModel()
      };
    });

    const anchorFileModel = {
      mapFileHash,
      operations: {
        createOperations,
        recoverOperations,
        revokeOperations
      }
    };

    return anchorFileModel;
  }

  /**
   * Creates an anchor file buffer.
   */
  public static async createBuffer (
    mapFileHash: string,
    createOperations: CreateOperation[],
    recoverOperations: RecoverOperation[],
    revokeOperations: RevokeOperation[]
  ): Promise<Buffer> {
    const anchorFileModel = await AnchorFile.createModel(mapFileHash, createOperations, recoverOperations, revokeOperations);
    const anchorFileJson = JSON.stringify(anchorFileModel);
    const anchorFileBuffer = Buffer.from(anchorFileJson);

    return Compressor.compress(anchorFileBuffer);
  }
}

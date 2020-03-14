import AnchorFileModel from './models/AnchorFileModel';
import Compressor from './util/Compressor';
import CreateOperation from './CreateOperation';
import Encoder from './Encoder';
import ErrorCode from './ErrorCode';
import JsonAsync from './util/JsonAsync';
import Multihash from './Multihash';
import ProtocolParameters from './ProtocolParameters';
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
      throw new SidetreeError(ErrorCode.AnchorFileDidUniqueSuffixesMissing);
    }

    // Map file hash validations.
    if (typeof anchorFileModel.mapFileHash !== 'string') {
      throw new SidetreeError(ErrorCode.AnchorFileMapFileHashNotString);
    }

    const didUniqueSuffixBuffer = Encoder.decodeAsBuffer(anchorFileModel.mapFileHash);
    if (!Multihash.isComputedUsingHashAlgorithm(didUniqueSuffixBuffer, ProtocolParameters.hashAlgorithmInMultihashCode)) {
      throw new SidetreeError(ErrorCode.AnchorFileMapFileHashUnsupported, `Map file hash '${anchorFileModel.mapFileHash}' is unsupported.`);
    }

    // `operation` validations.

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

      for (const createOperation of operations.createOperations) {
        CreateOperation.
      }
    }

    // Validate `recoverOperations` if exists.
    if (operations.recoverOperations !== undefined) {
      if (!Array.isArray(operations.recoverOperations)) {
        throw new SidetreeError(ErrorCode.AnchorFileRecoverOperationsNotArray);
      }
    }

    // Validate `revokeOperations` if exists.
    if (operations.revokeOperations !== undefined) {
      if (!Array.isArray(operations.revokeOperations)) {
        throw new SidetreeError(ErrorCode.AnchorFileRevokeOperationsNotArray);
      }
    }

    if (AnchorFile.hasDuplicates(didUniqueSuffixes)) {
      throw new SidetreeError(ErrorCode.AnchorFileMultipleOperationsForTheSameDid);
    }

    return anchorFileModel;
  }

  /**
   * Checkes to see if there are duplicates in the given array.
   */
  public static hasDuplicates<T> (array: Array<T>): boolean {
    const uniqueValues = new Set<T>();

    for (let i = 0; i < array.length; i++) {
      const value = array[i];
      if (uniqueValues.has(value)) {
        return true;
      }
      uniqueValues.add(value);
    }

    return false;
  }

  /**
   * Creates a buffer from the input so that the buffer can be persisted.
   */
  public static async createBufferFromAnchorFileModel (anchorFileModel: AnchorFileModel): Promise<Buffer> {

    const anchorFileJson = JSON.stringify(anchorFileModel);
    const anchorFileBuffer = Buffer.from(anchorFileJson);

    return Compressor.compress(anchorFileBuffer);
  }
}

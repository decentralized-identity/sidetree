import ArrayMethods from './util/ArrayMethods';
import Compressor from './util/Compressor';
import ErrorCode from './ErrorCode';
import JsonAsync from './util/JsonAsync';
import MapFileModel from './models/MapFileModel';
import SidetreeError from '../../../common/SidetreeError';
import UpdateOperation from './UpdateOperation';

/**
 * Class containing Map File related operations.
 */
export default class MapFile {
  /**
   * Parses and validates the given map file buffer.
   * @throws `SidetreeError` if failed parsing or validation.
   */
  public static async parse (mapFileBuffer: Buffer): Promise<MapFileModel> {

    let decompressedBuffer;
    try {
      decompressedBuffer = await Compressor.decompress(mapFileBuffer);
    } catch (error) {
      throw SidetreeError.createFromError(ErrorCode.MapFileDecompressionFailure, error);
    }

    let mapFile;
    try {
      mapFile = await JsonAsync.parse(decompressedBuffer);
    } catch (error) {
      throw SidetreeError.createFromError(ErrorCode.MapFileNotJson, error);
    }

    const allowedProperties = new Set(['batchFileHash', 'updateOperations']);
    for (let property in mapFile) {
      if (!allowedProperties.has(property)) {
        throw new SidetreeError(ErrorCode.MapFileHasUnknownProperty);
      }
    }

    if (typeof mapFile.batchFileHash !== 'string') {
      throw new SidetreeError(ErrorCode.MapFileBatchFileHashMissingOrIncorrectType);
    }

    // Validate `updateOperations` if exists.
    const updateOperations = mapFile.updateOperations;
    if (updateOperations !== undefined) {
      if (!Array.isArray(updateOperations)) {
        throw new SidetreeError(ErrorCode.MapFileUpdateOperationsNotArray);
      }

      // TODO: Validate each operation.
      // for (const operation of updateOperations) {
      //   // const createOperation = await UpdateOperation.parseOpertionFromAnchorFile(operation);
      // }

      const didUniqueSuffixes = (mapFile as MapFileModel).updateOperations!.map(operation => operation.didUniqueSuffix);
      if (ArrayMethods.hasDuplicates(didUniqueSuffixes)) {
        throw new SidetreeError(ErrorCode.MapFileMultipleOperationsForTheSameDid);
      }
    }

    return mapFile;
  }

  /**
   * Creates the Map File buffer.
   */
  public static async createBuffer (batchFileHash: string, updateOperationArray: UpdateOperation[]): Promise<Buffer> {
    const updateOperations = updateOperationArray.map(operation => {
      return {
        didUniqueSuffix: operation.didUniqueSuffix,
        updateOtp: operation.updateOtp,
        signedOperationDataHash: operation.signedOperationDataHash.toJwsModel()
      };
    });

    const mapFileModel = {
      batchFileHash,
      updateOperations
    };

    const rawData = JSON.stringify(mapFileModel);
    const compressedRawData = await Compressor.compress(Buffer.from(rawData));

    return compressedRawData;
  }
}

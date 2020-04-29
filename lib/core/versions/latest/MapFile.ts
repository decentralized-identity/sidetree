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
   * Class that represents a map file.
   * NOTE: this class is introduced as an internal structure in replacement to `MapFileModel`
   * to keep useful metadata so that repeated computation can be avoided.
   */
  private constructor (
    public readonly model: MapFileModel,
    public readonly didUniqueSuffixes: string[],
    public readonly updateOperations: UpdateOperation[]) { }

  /**
   * Parses and validates the given map file buffer.
   * @throws `SidetreeError` if failed parsing or validation.
   */
  public static async parse (mapFileBuffer: Buffer): Promise<MapFile> {

    let decompressedBuffer;
    try {
      decompressedBuffer = await Compressor.decompress(mapFileBuffer);
    } catch (error) {
      throw SidetreeError.createFromError(ErrorCode.MapFileDecompressionFailure, error);
    }

    let mapFileModel;
    try {
      mapFileModel = await JsonAsync.parse(decompressedBuffer);
    } catch (error) {
      throw SidetreeError.createFromError(ErrorCode.MapFileNotJson, error);
    }

    const allowedProperties = new Set(['batchFileHash', 'updateOperations']);
    for (let property in mapFileModel) {
      if (!allowedProperties.has(property)) {
        throw new SidetreeError(ErrorCode.MapFileHasUnknownProperty);
      }
    }

    if (typeof mapFileModel.batchFileHash !== 'string') {
      throw new SidetreeError(ErrorCode.MapFileBatchFileHashMissingOrIncorrectType);
    }

    // Validate `updateOperations` if exists.
    const updateOperations: UpdateOperation[] = [];
    let didUniqueSuffixes: string[] = [];
    if (mapFileModel.updateOperations !== undefined) {
      if (!Array.isArray(mapFileModel.updateOperations)) {
        throw new SidetreeError(ErrorCode.MapFileUpdateOperationsNotArray);
      }

      // Validate each operation.
      for (const operation of mapFileModel.updateOperations) {
        const updateOperation = await UpdateOperation.parseOperationFromMapFile(operation);
        updateOperations.push(updateOperation);
      }

      didUniqueSuffixes = updateOperations.map(operation => operation.didUniqueSuffix);
      if (ArrayMethods.hasDuplicates(didUniqueSuffixes)) {
        throw new SidetreeError(ErrorCode.MapFileMultipleOperationsForTheSameDid);
      }
    }

    const mapFile = new MapFile(mapFileModel, didUniqueSuffixes, updateOperations);
    return mapFile;
  }

  /**
   * Creates the Map File buffer.
   */
  public static async createBuffer (batchFileHash: string, updateOperationArray: UpdateOperation[]): Promise<Buffer> {
    const updateOperations = updateOperationArray.map(operation => {
      return {
        did_suffix: operation.didUniqueSuffix,
        update_reveal_value: operation.updateRevealValue,
        signed_data: operation.signedDataJws.toCompactJws()
      };
    });

    const mapFileModel = {
      batchFileHash,
      // Only insert an `updateOperations` property if the array is not empty.
      updateOperations: (updateOperations.length > 0) ? updateOperations : undefined
    };

    const rawData = JSON.stringify(mapFileModel);
    const compressedRawData = await Compressor.compress(Buffer.from(rawData));

    return compressedRawData;
  }
}

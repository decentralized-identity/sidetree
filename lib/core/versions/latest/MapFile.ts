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

    const mapFileProperties = Object.keys(mapFile);
    if (mapFileProperties.length > 1) {
      throw new SidetreeError(ErrorCode.MapFileHasUnknownProperty);
    }

    if (typeof mapFile.batchFileHash !== 'string') {
      throw new SidetreeError(ErrorCode.MapFileBatchFileHashMissingOrIncorrectType);
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

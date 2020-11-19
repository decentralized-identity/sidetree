import ArrayMethods from './util/ArrayMethods';
import Compressor from './util/Compressor';
import ErrorCode from './ErrorCode';
import InputValidator from './InputValidator';
import JsonAsync from './util/JsonAsync';
import MapFileModel from './models/MapFileModel';
import Multihash from './Multihash';
import OperationReferenceModel from './models/OperationReferenceModel';
import ProtocolParameters from './ProtocolParameters';
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
    public model: MapFileModel,
    public didUniqueSuffixes: string[]) { }

  /**
   * Parses and validates the given map file buffer.
   * @throws `SidetreeError` if failed parsing or validation.
   */
  public static async parse (mapFileBuffer: Buffer): Promise<MapFile> {

    let decompressedBuffer;
    try {
      const maxAllowedDecompressedSizeInBytes = ProtocolParameters.maxMapFileSizeInBytes * Compressor.estimatedDecompressionMultiplier;
      decompressedBuffer = await Compressor.decompress(mapFileBuffer, maxAllowedDecompressedSizeInBytes);
    } catch (error) {
      throw SidetreeError.createFromError(ErrorCode.MapFileDecompressionFailure, error);
    }

    let mapFileModel;
    try {
      mapFileModel = await JsonAsync.parse(decompressedBuffer);
    } catch (error) {
      throw SidetreeError.createFromError(ErrorCode.MapFileNotJson, error);
    }

    const allowedProperties = new Set(['chunks', 'operations', 'provisionalProofFileUri']);
    for (const property in mapFileModel) {
      if (!allowedProperties.has(property)) {
        throw new SidetreeError(ErrorCode.MapFileHasUnknownProperty);
      }
    }

    MapFile.validateChunksProperty(mapFileModel.chunks);

    const didSuffixes = await MapFile.validateOperationsProperty(mapFileModel.operations);

    // Validate provisional proof file URI.
    if (didSuffixes.length > 0) {
      InputValidator.validateCasFileUri(mapFileModel.provisionalProofFileUri, 'provisional proof file URI');
    } else {
      if (mapFileModel.provisionalProofFileUri !== undefined) {
        throw new SidetreeError(
          ErrorCode.MapFileProvisionalProofFileUriNotAllowed,
          `Provisional proof file '${mapFileModel.provisionalProofFileUri}' not allowed in a map file with no updates.`
        );
      }
    }

    const mapFile = new MapFile(mapFileModel, didSuffixes);
    return mapFile;
  }

  /**
   * Removes all the update operation references from this map file.
   */
  public removeAllUpdateOperationReferences () {
    delete this.model.operations;
    delete this.model.provisionalProofFileUri;
    this.didUniqueSuffixes = [];
  }

  /**
   * Validates the given `operations` property, throws error if the property fails validation.
   *
   * @returns The of array of unique DID suffixes if validation succeeds.
   */
  private static validateOperationsProperty (operations: any): string[] {
    if (operations === undefined) {
      return [];
    }

    InputValidator.validateObjectContainsOnlyAllowedProperties(operations, ['update'], 'provisional operation references');

    if (!Array.isArray(operations.update)) {
      throw new SidetreeError(ErrorCode.MapFileUpdateOperationsNotArray);
    }

    // Validate all update operation references.
    MapFile.validateUpdateOperationReferences(operations.update);

    // Make sure no operation with same DID.
    const didSuffixes = (operations.update as OperationReferenceModel[]).map(operation => operation.didSuffix);
    if (ArrayMethods.hasDuplicates(didSuffixes)) {
      throw new SidetreeError(ErrorCode.MapFileMultipleOperationsForTheSameDid);
    }

    return didSuffixes;
  }

  private static validateUpdateOperationReferences (updateReferences: any) {
    for (const updateReference of updateReferences) {
      InputValidator.validateObjectContainsOnlyAllowedProperties(updateReference, ['didSuffix', 'revealValue'], 'update operation reference');

      const didSuffixType = typeof updateReference.didSuffix;
      if (didSuffixType !== 'string') {
        throw new SidetreeError(
          ErrorCode.UpdateReferenceDidSuffixIsNotAString,
          `Update reference property 'didSuffix' is of type ${didSuffixType}, but needs to be a string.`
        );
      }

      const revealValueType = typeof updateReference.revealValue;
      if (revealValueType !== 'string') {
        throw new SidetreeError(
          ErrorCode.UpdateReferenceRevealValueIsNotAString,
          `Update reference property 'revealValue' is of type ${revealValueType}, but needs to be a string.`
        );
      }
    }
  }

  /**
   * Validates the given `chunks` property, throws error if the property fails validation.
   */
  private static validateChunksProperty (chunks: any) {
    if (!Array.isArray(chunks)) {
      throw new SidetreeError(ErrorCode.MapFileChunksPropertyMissingOrIncorrectType);
    }

    // This version expects only one hash.
    if (chunks.length !== 1) {
      throw new SidetreeError(ErrorCode.MapFileChunksPropertyDoesNotHaveExactlyOneElement);
    }

    const chunk = chunks[0];
    const properties = Object.keys(chunk);
    if (properties.length !== 1) {
      throw new SidetreeError(ErrorCode.MapFileChunkHasMissingOrUnknownProperty);
    }

    Multihash.verifyEncodedHashIsComputedUsingLastestAlgorithm(chunk.chunkFileUri);
  }

  /**
   * Creates the Map File buffer.
   */
  public static async createBuffer (
    chunkFileHash: string, provisionalProofFileHash: string | undefined, updateOperationArray: UpdateOperation[]
  ): Promise<Buffer> {
    const updateOperations = updateOperationArray.map(operation => {
      const revealValue = Multihash.canonicalizeThenHashThenEncode(operation.signedData.updateKey);

      return {
        didSuffix: operation.didUniqueSuffix,
        revealValue
      };
    });

    const mapFileModel: MapFileModel = {
      chunks: [{ chunkFileUri: chunkFileHash }]
    };

    // Only insert `operations` and `provisionalProofFileHash` properties if there are update operations.
    if (updateOperations.length > 0) {
      mapFileModel.operations = {
        update: updateOperations
      };

      mapFileModel.provisionalProofFileUri = provisionalProofFileHash;
    }

    const rawData = JSON.stringify(mapFileModel);
    const compressedRawData = await Compressor.compress(Buffer.from(rawData));

    return compressedRawData;
  }
}

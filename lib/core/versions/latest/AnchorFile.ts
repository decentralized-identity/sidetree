import AnchorFileModel from './models/AnchorFileModel';
import Compressor from './util/Compressor';
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
  public static async parseAndValidate (anchorFileBuffer: Buffer): Promise<AnchorFileModel> {

    let anchorFileDecompressedBuffer;
    try {
      anchorFileDecompressedBuffer = await Compressor.decompress(anchorFileBuffer);
    } catch (e) {
      throw SidetreeError.createFromError(ErrorCode.AnchorFileDecompressionFailure, e);
    }

    let anchorFile;
    try {
      anchorFile = await JsonAsync.parse(anchorFileDecompressedBuffer);
    } catch (e) {
      throw SidetreeError.createFromError(ErrorCode.AnchorFileNotJson, e);
    }

    const anchorFileProperties = Object.keys(anchorFile);
    if (anchorFileProperties.length > 2) {
      throw new SidetreeError(ErrorCode.AnchorFileHasUnknownProperty);
    }

    if (!anchorFile.hasOwnProperty('mapFileHash')) {
      throw new SidetreeError(ErrorCode.AnchorFileMapFileHashMissing);
    }

    if (!anchorFile.hasOwnProperty('didUniqueSuffixes')) {
      throw new SidetreeError(ErrorCode.AnchorFileDidUniqueSuffixesMissing);
    }

    // Map file hash validations.
    if (typeof anchorFile.mapFileHash !== 'string') {
      throw new SidetreeError(ErrorCode.AnchorFileMapFileHashNotString);
    }

    const didUniqueSuffixBuffer = Encoder.decodeAsBuffer(anchorFile.mapFileHash);
    if (!Multihash.isComputedUsingHashAlgorithm(didUniqueSuffixBuffer, ProtocolParameters.hashAlgorithmInMultihashCode)) {
      throw new SidetreeError(ErrorCode.AnchorFileMapFileHashUnsupported, `Map file hash '${anchorFile.mapFileHash}' is unsupported.`);
    }

    // DID Unique Suffixes validations.
    if (!Array.isArray(anchorFile.didUniqueSuffixes)) {
      throw new SidetreeError(ErrorCode.AnchorFileDidUniqueSuffixesNotArray);
    }

    if (anchorFile.didUniqueSuffixes.length > ProtocolParameters.maxOperationsPerBatch) {
      throw new SidetreeError(ErrorCode.AnchorFileExceededMaxOperationCount);
    }

    if (this.hasDuplicates(anchorFile.didUniqueSuffixes)) {
      throw new SidetreeError(ErrorCode.AnchorFileDidUniqueSuffixesHasDuplicates);
    }

    // Verify each entry in DID unique suffixes.
    for (let uniqueSuffix of anchorFile.didUniqueSuffixes) {
      if (typeof uniqueSuffix !== 'string') {
        throw new SidetreeError(ErrorCode.AnchorFileDidUniqueSuffixEntryNotString);
      }

      const maxEncodedHashStringLength = ProtocolParameters.maxEncodedHashStringLength;
      if (uniqueSuffix.length > maxEncodedHashStringLength) {
        throw new SidetreeError(ErrorCode.AnchorFileDidUniqueSuffixTooLong, `Unique suffix '${uniqueSuffix}' exceeds length of ${maxEncodedHashStringLength}.`);
      }
    }

    return anchorFile;
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

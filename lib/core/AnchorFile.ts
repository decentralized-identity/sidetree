import Encoder from './Encoder';
import ErrorCode from '../common/ErrorCode';
import Multihash from './Multihash';
import { SidetreeError } from './Error';

/**
 * Defines Anchor File structure.
 */
export interface IAnchorFile {
  batchFileHash: string;
  merkleRoot: string;
  didUniqueSuffixes: string[];
}

/**
 * Class containing Anchor File related operations.
 */
export default class AnchorFile {
  /**
   * TODO: remove hashAlgorithmInMultihashCode and load directed from protocol-parameters.json.
   * Parses and validates the given anchor file buffer.
   * @param hashAlgorithmInMultihashCode The hash algorithm to use to validate the transaction files.
   * @param allSupportedHashAlgorithms All the hash algorithms used across protocol versions, needed for validations such as DID strings.
   * @throws `SidetreeError` if failed parsing or validation.
   */
  public static parseAndValidate (
    anchorFileBuffer: Buffer,
    maxOperationsPerBatch: number,
    hashAlgorithmInMultihashCode: number,
    allSupportedHashAlgorithms: number[]): IAnchorFile {

    let anchorFile;
    try {
      anchorFile = JSON.parse(anchorFileBuffer.toString());
    } catch {
      throw new SidetreeError(ErrorCode.AnchorFileNotJson);
    }

    const anchorFileProperties = Object.keys(anchorFile);
    if (anchorFileProperties.length > 3) {
      throw new SidetreeError(ErrorCode.AnchorFileHasUnknownProperty);
    }

    if (!anchorFile.hasOwnProperty('batchFileHash')) {
      throw new SidetreeError(ErrorCode.AnchorFileBatchFileHashMissing);
    }

    if (!anchorFile.hasOwnProperty('didUniqueSuffixes')) {
      throw new SidetreeError(ErrorCode.AnchorFileDidUniqueSuffixesMissing);
    }

    if (!anchorFile.hasOwnProperty('merkleRoot')) {
      throw new SidetreeError(ErrorCode.AnchorFileMerkleRootMissing);
    }

    // Batch file hash validations.
    if (typeof anchorFile.batchFileHash !== 'string') {
      throw new SidetreeError(ErrorCode.AnchorFileBatchFileHashNotString);
    }

    const didUniqueSuffixBuffer = Encoder.decodeAsBuffer(anchorFile.batchFileHash);
    if (!Multihash.isValidHash(didUniqueSuffixBuffer, hashAlgorithmInMultihashCode)) {
      throw new SidetreeError(ErrorCode.AnchorFileBatchFileHashUnsupported, `Batch file hash '${anchorFile.batchFileHash}' is unsupported.`);
    }

    // Merkle root hash validations.
    if (typeof anchorFile.merkleRoot !== 'string') {
      throw new SidetreeError(ErrorCode.AnchorFileMerkleRootNotString);
    }

    const merkleRootBuffer = Encoder.decodeAsBuffer(anchorFile.merkleRoot);
    if (!Multihash.isValidHash(merkleRootBuffer, hashAlgorithmInMultihashCode)) {
      throw new SidetreeError(ErrorCode.AnchorFileMerkleRootUnsupported, `Merkle root '${anchorFile.merkleRoot}' is unsupported.`);
    }

    // DID Unique Suffixes validations.
    if (!Array.isArray(anchorFile.didUniqueSuffixes)) {
      throw new SidetreeError(ErrorCode.AnchorFileDidUniqueSuffixesNotArray);
    }

    if (anchorFile.didUniqueSuffixes.length > maxOperationsPerBatch) {
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

      const uniqueSuffixBuffer = Encoder.decodeAsBuffer(uniqueSuffix);
      if (!Multihash.isSupportedHash(uniqueSuffixBuffer, allSupportedHashAlgorithms)) {
        throw new SidetreeError(ErrorCode.AnchorFileDidUniqueSuffixEntryInvalid, `Unique suffix '${uniqueSuffix}' is invalid.`);
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
}

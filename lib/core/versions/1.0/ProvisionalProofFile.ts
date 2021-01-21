import Compressor from './util/Compressor';
import ErrorCode from './ErrorCode';
import InputValidator from './InputValidator';
import JsonAsync from './util/JsonAsync';
import Jws from './util/Jws';
import ProtocolParameters from './ProtocolParameters';
import ProvisionalProofFileModel from './models/ProvisionalProofFileModel';
import SidetreeError from '../../../common/SidetreeError';
import UpdateOperation from './UpdateOperation';
import UpdateSignedDataModel from './models/UpdateSignedDataModel';

/**
 * Defines operations related to a Provisional Proof File.
 */
export default class ProvisionalProofFile {
  /**
   * Class that represents a provisional proof file.
   * NOTE: this class is introduced as an internal structure that keeps useful states in replacement to `ProvisionalProofFileModel`
   * so that repeated computation can be avoided.
   */
  private constructor (
    public readonly provisionalProofFileModel: ProvisionalProofFileModel,
    public readonly updateProofs: { signedDataJws: Jws, signedDataModel: UpdateSignedDataModel }[]
  ) { }

  /**
   * Creates the buffer of a Provisional Proof File.
   *
   * @returns `Buffer` if at least one operation is given, `undefined` otherwise.
   */
  public static async createBuffer (updateOperations: UpdateOperation[]): Promise<Buffer | undefined> {
    if (updateOperations.length === 0) {
      return undefined;
    }

    const updateProofs = updateOperations.map(operation => { return { signedData: operation.signedDataJws.toCompactJws() }; });

    const provisionalProofFileModel = {
      operations: {
        update: updateProofs
      }
    };

    const rawData = Buffer.from(JSON.stringify(provisionalProofFileModel));
    const compressedRawData = await Compressor.compress(Buffer.from(rawData));

    return compressedRawData;
  }

  /**
   * Parses and validates the given provisional proof file buffer.
   * @param provisionalProofFileBuffer Compressed provisional proof file.
   * @throws `SidetreeError` if failed parsing or validation.
   */
  public static async parse (provisionalProofFileBuffer: Buffer): Promise<ProvisionalProofFile> {
    let provisionalProofFileDecompressedBuffer;
    try {
      const maxAllowedDecompressedSizeInBytes = ProtocolParameters.maxProofFileSizeInBytes * Compressor.estimatedDecompressionMultiplier;
      provisionalProofFileDecompressedBuffer = await Compressor.decompress(provisionalProofFileBuffer, maxAllowedDecompressedSizeInBytes);
    } catch (error) {
      throw SidetreeError.createFromError(ErrorCode.ProvisionalProofFileDecompressionFailure, error);
    }

    let provisionalProofFileModel;
    try {
      provisionalProofFileModel = await JsonAsync.parse(provisionalProofFileDecompressedBuffer);
    } catch (error) {
      throw SidetreeError.createFromError(ErrorCode.ProvisionalProofFileNotJson, error);
    }

    if (provisionalProofFileModel.operations === undefined) {
      throw new SidetreeError(ErrorCode.ProvisionalProofFileOperationsNotFound, `Provisional proof file does not have any operation proofs.`);
    }

    const operations = provisionalProofFileModel.operations;
    InputValidator.validateObjectContainsOnlyAllowedProperties(operations, ['update'], 'provisional proof file');

    const updateProofs = [];

    // Validate `update` array if it is defined.
    const updateProofModels = operations.update;
    if (!Array.isArray(updateProofModels)) {
      throw new SidetreeError(
        ErrorCode.ProvisionalProofFileUpdatePropertyNotAnArray,
        `'update' property in provisional proof file is not an array with entries.`
      );
    }

    // Parse and validate each compact JWS.
    for (const proof of updateProofModels) {
      InputValidator.validateObjectContainsOnlyAllowedProperties(proof, ['signedData'], 'update proof');

      const signedDataJws = Jws.parseCompactJws(proof.signedData);
      const signedDataModel = await UpdateOperation.parseSignedDataPayload(signedDataJws.payload);

      updateProofs.push({
        signedDataJws,
        signedDataModel
      });
    }

    if (updateProofs.length === 0) {
      throw new SidetreeError(ErrorCode.ProvisionalProofFileHasNoProofs, `Provisional proof file has no proofs.`);
    }

    return new ProvisionalProofFile(provisionalProofFileModel, updateProofs);
  }
}

import Encoder from './Encoder';
import ErrorCode from './ErrorCode';
import JsonAsync from './util/JsonAsync';
import Multihash from './Multihash';
import PatchDataModel from './models/PatchDataModel';
import Operation from './Operation';
import OperationModel from './models/OperationModel';
import OperationType from '../../enums/OperationType';
import PublicKeyModel from '../../models/PublicKeyModel';
import SidetreeError from '../../../common/SidetreeError';

interface SuffixDataModel {
  patchDataHash: string;
  recoveryKey: PublicKeyModel;
  nextRecoveryCommitmentHash: string;
}

/**
 * A class that represents a create operation.
 */
export default class CreateOperation implements OperationModel {

  /** The original request buffer sent by the requester. */
  public readonly operationBuffer: Buffer;

  /** The unique suffix of the DID. */
  public readonly didUniqueSuffix: string;

  /** The type of operation. */
  public readonly type: OperationType;

  /** Data used to generate the unique DID suffix. */
  public readonly suffixData: SuffixDataModel;

  /** Patch data. */
  public readonly patchData: PatchDataModel | undefined;

  /** Encoded string of the suffix data. */
  public readonly encodedSuffixData: string;

  /** Encoded string of the patch data. */
  public readonly encodedPatchData: string | undefined;

  /**
   * NOTE: should only be used by `parse()` and `parseObject()` else the contructed instance could be invalid.
   */
  private constructor (
    operationBuffer: Buffer,
    didUniqueSuffix: string,
    encodedSuffixData: string,
    suffixData: SuffixDataModel,
    encodedPatchData: string | undefined,
    patchData: PatchDataModel | undefined) {
    this.didUniqueSuffix = didUniqueSuffix;
    this.type = OperationType.Create;
    this.operationBuffer = operationBuffer;
    this.encodedSuffixData = encodedSuffixData;
    this.suffixData = suffixData;
    this.encodedPatchData = encodedPatchData;
    this.patchData = patchData;
  }

  /**
   * Computes the cryptographic multihash of the given string.
   */
  private static computeDidUniqueSuffix (encodedSuffixData: string): string {
    const dataBuffer = Encoder.decodeAsBuffer(encodedSuffixData);
    const multihash = Multihash.hash(dataBuffer);
    const encodedMultihash = Encoder.encode(multihash);
    return encodedMultihash;
  }

  /**
   * Parses the given input as a create operation entry in the anchor file.
   */
  public static async parseOpertionFromAnchorFile (input: any): Promise<CreateOperation> {
    // Issue #442 - Replace `operationBuffer` in `OperationModel` and `AnchoredOperationModel` with actual operation request
    const opertionBuffer = Buffer.from(JSON.stringify(input));
    const operation = await CreateOperation.parseObject(input, opertionBuffer, true);
    return operation;
  }

  /**
   * Parses the given buffer as a `CreateOperation`.
   */
  public static async parse (operationBuffer: Buffer): Promise<CreateOperation> {
    const operationJsonString = operationBuffer.toString();
    const operationObject = await JsonAsync.parse(operationJsonString);
    const createOperation = await CreateOperation.parseObject(operationObject, operationBuffer, false);
    return createOperation;
  }

  /**
   * Parses the given operation object as a `CreateOperation`.
   * The `operationBuffer` given is assumed to be valid and is assigned to the `operationBuffer` directly.
   * NOTE: This method is purely intended to be used as an optimization method over the `parse` method in that
   * JSON parsing is not required to be performed more than once when an operation buffer of an unknown operation type is given.
   * @param anchorFileMode If set to true, then `patchData` and `type` properties are expected to be absent.
   */
  public static async parseObject (operationObject: any, operationBuffer: Buffer, anchorFileMode: boolean): Promise<CreateOperation> {
    let expectedPropertyCount = 3;
    if (anchorFileMode) {
      expectedPropertyCount = 1;
    }

    const properties = Object.keys(operationObject);
    if (properties.length !== expectedPropertyCount) {
      throw new SidetreeError(ErrorCode.CreateOperationMissingOrUnknownProperty);
    }

    const encodedSuffixData = operationObject.suffixData;
    const suffixData = await CreateOperation.parseSuffixData(encodedSuffixData);

    // If not in anchor file mode, we need to validate `type` and `patchData` properties.
    let encodedPatchData = undefined;
    let patchData = undefined;
    if (!anchorFileMode) {
      if (operationObject.type !== OperationType.Create) {
        throw new SidetreeError(ErrorCode.CreateOperationTypeIncorrect);
      }

      encodedPatchData = operationObject.patchData;
      try {
        patchData = await Operation.parsePatchData(operationObject.patchData);
      } catch {
        // For compatibility with data pruning, we have to assume that patch data may be unavailable,
        // thus an operation with invalid patch data needs to be processed as an operation with unavailable patch data,
        // so here we let patch data be `undefined`.
      }
    }

    const didUniqueSuffix = CreateOperation.computeDidUniqueSuffix(operationObject.suffixData);
    return new CreateOperation(operationBuffer, didUniqueSuffix, encodedSuffixData, suffixData, encodedPatchData, patchData);
  }

  private static async parseSuffixData (suffixDataEncodedString: any): Promise<SuffixDataModel> {
    if (typeof suffixDataEncodedString !== 'string') {
      throw new SidetreeError(ErrorCode.CreateOperationSuffixDataMissingOrNotString);
    }

    const suffixDataJsonString = Encoder.decodeAsString(suffixDataEncodedString);
    const suffixData = await JsonAsync.parse(suffixDataJsonString);

    const properties = Object.keys(suffixData);
    if (properties.length !== 3) {
      throw new SidetreeError(ErrorCode.CreateOperationSuffixDataMissingOrUnknownProperty);
    }

    Operation.validateRecoveryKeyObject(suffixData.recoveryKey);

    const patchDataHash = Encoder.decodeAsBuffer(suffixData.patchDataHash);
    const nextRecoveryCommitmentHash = Encoder.decodeAsBuffer(suffixData.nextRecoveryCommitmentHash);

    Multihash.verifyHashComputedUsingLatestSupportedAlgorithm(patchDataHash);
    Multihash.verifyHashComputedUsingLatestSupportedAlgorithm(nextRecoveryCommitmentHash);

    return suffixData;
  }
}

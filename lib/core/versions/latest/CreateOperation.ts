import DeltaModel from './models/DeltaModel';
import Did from './Did';
import Encoder from './Encoder';
import ErrorCode from './ErrorCode';
import InputValidator from './InputValidator';
import JsonAsync from './util/JsonAsync';
import JsonCanonicalizer from './util/JsonCanonicalizer';
import Multihash from './Multihash';
import Operation from './Operation';
import OperationModel from './models/OperationModel';
import OperationType from '../../enums/OperationType';
import SidetreeError from '../../../common/SidetreeError';
import SuffixDataModel from './models/SuffixDataModel';

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

  /** Delta. */
  public readonly delta: DeltaModel | undefined;

  /** Encoded string of the suffix data. */
  public readonly encodedSuffixData: string;

  /** Encoded string of the delta. */
  public readonly encodedDelta: string | undefined;

  /**
   * NOTE: should only be used by `parse()` and `parseObject()` else the constructed instance could be invalid.
   */
  private constructor (
    operationBuffer: Buffer,
    didUniqueSuffix: string,
    encodedSuffixData: string,
    suffixData: SuffixDataModel,
    encodedDelta: string | undefined,
    delta: DeltaModel | undefined) {
    this.didUniqueSuffix = didUniqueSuffix;
    this.type = OperationType.Create;
    this.operationBuffer = operationBuffer;
    this.encodedSuffixData = encodedSuffixData;
    this.suffixData = suffixData;
    this.encodedDelta = encodedDelta;
    this.delta = delta;
  }

  /**
   * Computes the DID unique suffix given the encoded suffix data string.
   */
  private static computeDidUniqueSuffix (encodedSuffixData: string): string {
    const suffixDataBuffer = Encoder.decodeAsBuffer(encodedSuffixData);
    const multihash = Multihash.hash(suffixDataBuffer);
    const encodedMultihash = Encoder.encode(multihash);
    return encodedMultihash;
  }

  /**
   * Parses the given buffer as a `CreateOperation`.
   */
  public static async parse (operationBuffer: Buffer): Promise<CreateOperation> {
    const operationJsonString = operationBuffer.toString();
    const operationObject = await JsonAsync.parse(operationJsonString);
    let createOperation;
    if (typeof operationObject.suffixData === 'string') {
      // TODO: SIP 2 #781 deprecates this. Should be deleted when fully switched over
      createOperation = await CreateOperation.parseObject(operationObject, operationBuffer, false);
    } else {
      createOperation = CreateOperation.parseJcsObject(operationObject, operationBuffer);
    }
    return createOperation;
  }

  /**
   * Parses the given operation object as a `CreateOperation`.
   * The `operationBuffer` given is assumed to be valid and is assigned to the `operationBuffer` directly.
   * NOTE: This method is purely intended to be used as an optimization method over the `parse` method in that
   * JSON parsing is not required to be performed more than once when an operation buffer of an unknown operation type is given.
   * @param operationObject The operationObject is a json object with no encoding
   * @param operationBuffer The buffer format of the operationObject
   */
  public static parseJcsObject (operationObject: any, operationBuffer: Buffer): CreateOperation {
    const expectedPropertyCount = 3;

    const properties = Object.keys(operationObject);
    if (properties.length !== expectedPropertyCount) {
      throw new SidetreeError(ErrorCode.CreateOperationMissingOrUnknownProperty);
    }

    if (operationObject.type !== OperationType.Create) {
      throw new SidetreeError(ErrorCode.CreateOperationTypeIncorrect);
    }

    const suffixData = operationObject.suffixData;
    InputValidator.validateSuffixData(suffixData);

    let delta;
    let encodedDelta;
    try {
      Operation.validateDelta(operationObject.delta);
      delta = operationObject.delta;
      // TODO: SIP 2 #781 remove encoded delta and encoded suffix data when old long form is fully deprecated.
      encodedDelta = Encoder.encode(JsonCanonicalizer.canonicalizeAsBuffer(operationObject.delta));
    } catch {
      // For compatibility with data pruning, we have to assume that `delta` may be unavailable,
      // thus an operation with invalid `delta` needs to be processed as an operation with unavailable `delta`,
      // so here we let `delta` be `undefined`.
    }

    const didUniqueSuffix = Did.computeUniqueSuffix(suffixData);

    const encodedSuffixData = Encoder.encode(JsonCanonicalizer.canonicalizeAsBuffer(suffixData));
    return new CreateOperation(operationBuffer, didUniqueSuffix, encodedSuffixData, suffixData, encodedDelta, delta);
  }

  /**
   * Parses the given operation object as a `CreateOperation`.
   * The `operationBuffer` given is assumed to be valid and is assigned to the `operationBuffer` directly.
   * NOTE: This method is purely intended to be used as an optimization method over the `parse` method in that
   * JSON parsing is not required to be performed more than once when an operation buffer of an unknown operation type is given.
   * @param anchorFileMode If set to true, then `delta` and `type` properties are expected to be absent.
   */
  public static async parseObject (operationObject: any, operationBuffer: Buffer, anchorFileMode: boolean): Promise<CreateOperation> {
    // TODO: SIP 2 #781 deprecates this. Should be deleted when fully switched over
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

    // If not in anchor file mode, we need to validate `type` and `delta` properties.
    let encodedDelta;
    let delta;
    if (!anchorFileMode) {
      if (operationObject.type !== OperationType.Create) {
        throw new SidetreeError(ErrorCode.CreateOperationTypeIncorrect);
      }

      encodedDelta = operationObject.delta;
      try {
        delta = await Operation.parseDelta(operationObject.delta);
      } catch {
        // For compatibility with data pruning, we have to assume that `delta` may be unavailable,
        // thus an operation with invalid `delta` needs to be processed as an operation with unavailable `delta`,
        // so here we let `delta` be `undefined`.
      }
    }

    const didUniqueSuffix = CreateOperation.computeDidUniqueSuffix(operationObject.suffixData);
    return new CreateOperation(operationBuffer, didUniqueSuffix, encodedSuffixData, suffixData, encodedDelta, delta);
  }

  private static async parseSuffixData (suffixDataEncodedString: any): Promise<SuffixDataModel> {
    if (typeof suffixDataEncodedString !== 'string') {
      throw new SidetreeError(ErrorCode.CreateOperationSuffixDataMissingOrNotString);
    }

    const suffixDataJsonString = Encoder.decodeAsString(suffixDataEncodedString);
    const suffixData = await JsonAsync.parse(suffixDataJsonString);
    InputValidator.validateSuffixData(suffixData);

    return {
      deltaHash: suffixData.deltaHash,
      recoveryCommitment: suffixData.recoveryCommitment,
      type: suffixData.type
    };
  }
}

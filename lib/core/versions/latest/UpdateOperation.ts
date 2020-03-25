import ErrorCode from './ErrorCode';
import JsonAsync from './util/JsonAsync';
import Jws from './util/Jws';
import Operation from './Operation';
import OperationDataModel from './models/OperationDataModel';
import OperationModel from './models/OperationModel';
import OperationType from '../../enums/OperationType';
import SidetreeError from '../../../common/SidetreeError';

/**
 * A class that represents an update operation.
 */
export default class UpdateOperation implements OperationModel {

  /** The original request buffer sent by the requester. */
  public readonly operationBuffer: Buffer;

  /** The unique suffix of the DID. */
  public readonly didUniqueSuffix: string;

  /** The type of operation. */
  public readonly type: OperationType;

  /** Encoded one-time password for the operation. */
  public readonly updateOtp: string;

  /** Signed one-time password for the operation. */
  public readonly signedOperationDataHash: Jws;

  /** Operation data. */
  public readonly operationData: OperationDataModel | undefined;

  /** Encoded string of the operation data. */
  public readonly encodedOperationData: string | undefined;

  /**
   * NOTE: should only be used by `parse()` and `parseObject()` else the contructed instance could be invalid.
   */
  private constructor (
    operationBuffer: Buffer,
    didUniqueSuffix: string,
    updateOtp: string,
    signedOperationDataHash: Jws,
    encodedOperationData: string | undefined,
    operationData: OperationDataModel | undefined) {
    this.operationBuffer = operationBuffer;
    this.type = OperationType.Update;
    this.didUniqueSuffix = didUniqueSuffix;
    this.updateOtp = updateOtp;
    this.signedOperationDataHash = signedOperationDataHash;
    this.encodedOperationData = encodedOperationData;
    this.operationData = operationData;
  }

  /**
   * Parses the given input as a recover operation entry in the anchor file.
   */
  public static async parseOpertionFromAnchorFile (input: any): Promise<UpdateOperation> {
    const opertionBuffer = Buffer.from(JSON.stringify(input));
    const operation = await UpdateOperation.parseObject(input, opertionBuffer, true);
    return operation;
  }

  /**
   * Parses the given buffer as a `UpdateOperation`.
   */
  public static async parse (operationBuffer: Buffer): Promise<UpdateOperation> {
    const operationJsonString = operationBuffer.toString();
    const operationObject = await JsonAsync.parse(operationJsonString);
    const updateOperation = await UpdateOperation.parseObject(operationObject, operationBuffer, false);
    return updateOperation;
  }

  /**
   * Parses the given operation object as a `UpdateOperation`.
   * The `operationBuffer` given is assumed to be valid and is assigned to the `operationBuffer` directly.
   * NOTE: This method is purely intended to be used as an optimization method over the `parse` method in that
   * JSON parsing is not required to be performed more than once when an operation buffer of an unknown operation type is given.
   * @param anchorFileMode If set to true, then `operationData` and `type` properties is expected to be absent.
   */
  public static async parseObject (operationObject: any, operationBuffer: Buffer, anchorFileMode: boolean): Promise<UpdateOperation> {
    let expectedPropertyCount = 5;
    if (anchorFileMode) {
      expectedPropertyCount = 3;
    }

    const properties = Object.keys(operationObject);
    if (properties.length !== expectedPropertyCount) {
      throw new SidetreeError(ErrorCode.UpdateOperationMissingOrUnknownProperty);
    }

    if (typeof operationObject.didUniqueSuffix !== 'string') {
      throw new SidetreeError(ErrorCode.UpdateOperationMissingDidUniqueSuffix);
    }

    if (typeof operationObject.updateOtp !== 'string') {
      throw new SidetreeError(ErrorCode.UpdateOperationUpdateOtpMissingOrInvalidType);
    }

    if ((operationObject.updateOtp as string).length > Operation.maxEncodedOtpLength) {
      throw new SidetreeError(ErrorCode.UpdateOperationUpdateOtpTooLong);
    }

    const updateOtp = operationObject.updateOtp;

    const signedOperationDataHash = Jws.parse(operationObject.signedOperationDataHash);

    // If not in anchor file mode, we need to validate `type` and `operationData` properties.
    let encodedOperationData = undefined;
    let operationData = undefined;
    if (!anchorFileMode) {
      if (operationObject.type !== OperationType.Update) {
        throw new SidetreeError(ErrorCode.UpdateOperationTypeIncorrect);
      }

      encodedOperationData = operationObject.operationData;
      operationData = await Operation.parseOperationData(encodedOperationData);
    }

    return new UpdateOperation(operationBuffer, operationObject.didUniqueSuffix, updateOtp, signedOperationDataHash, encodedOperationData, operationData);
  }
}

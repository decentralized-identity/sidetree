import DeltaModel from './models/DeltaModel';
import ErrorCode from './ErrorCode';
import JsonAsync from './util/JsonAsync';
import Jws from './util/Jws';
import Operation from './Operation';
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

  /** Encoded reveal value for the operation. */
  public readonly updateRevealValue: string;

  /** Signed data for the operation. */
  public readonly signedData: Jws;

  /** Patch data. */
  public readonly delta: DeltaModel | undefined;

  /** Encoded string of the delta. */
  public readonly encodedDelta: string | undefined;

  /**
   * NOTE: should only be used by `parse()` and `parseObject()` else the contructed instance could be invalid.
   */
  private constructor (
    operationBuffer: Buffer,
    didUniqueSuffix: string,
    updateRevealValue: string,
    signedData: Jws,
    encodedDelta: string | undefined,
    delta: DeltaModel | undefined) {
    this.operationBuffer = operationBuffer;
    this.type = OperationType.Update;
    this.didUniqueSuffix = didUniqueSuffix;
    this.updateRevealValue = updateRevealValue;
    this.signedData = signedData;
    this.encodedDelta = encodedDelta;
    this.delta = delta;
  }

  /**
   * Parses the given input as an update operation entry in the map file.
   */
  public static async parseOperationFromMapFile (input: any): Promise<UpdateOperation> {
    const operationBuffer = Buffer.from(JSON.stringify(input));
    const operation = await UpdateOperation.parseObject(input, operationBuffer, true);
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
   * @param mapFileMode If set to true, then `delta` and `type` properties are expected to be absent.
   */
  public static async parseObject (operationObject: any, operationBuffer: Buffer, mapFileMode: boolean): Promise<UpdateOperation> {
    let expectedPropertyCount = 5;
    if (mapFileMode) {
      expectedPropertyCount = 3;
    }

    const properties = Object.keys(operationObject);
    if (properties.length !== expectedPropertyCount) {
      throw new SidetreeError(ErrorCode.UpdateOperationMissingOrUnknownProperty);
    }

    if (typeof operationObject.didUniqueSuffix !== 'string') {
      throw new SidetreeError(ErrorCode.UpdateOperationMissingDidUniqueSuffix);
    }

    if (typeof operationObject.updateRevealValue !== 'string') {
      throw new SidetreeError(ErrorCode.UpdateOperationUpdateRevealValueMissingOrInvalidType);
    }

    if ((operationObject.updateRevealValue as string).length > Operation.maxEncodedRevealValueLength) {
      throw new SidetreeError(ErrorCode.UpdateOperationUpdateRevealValueTooLong);
    }

    const updateRevealValue = operationObject.updateRevealValue;

    const expectKidInHeader = true;
    const signedData = Jws.parseCompactJws(operationObject.signedData, expectKidInHeader);

    // If not in map file mode, we need to validate `type` and `delta` properties.
    let encodedDelta = undefined;
    let delta = undefined;
    if (!mapFileMode) {
      if (operationObject.type !== OperationType.Update) {
        throw new SidetreeError(ErrorCode.UpdateOperationTypeIncorrect);
      }

      encodedDelta = operationObject.delta;
      delta = await Operation.parseDelta(encodedDelta);
    }

    return new UpdateOperation(operationBuffer, operationObject.didUniqueSuffix,
      updateRevealValue, signedData, encodedDelta, delta);
  }
}

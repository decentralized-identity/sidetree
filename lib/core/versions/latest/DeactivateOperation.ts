import Encoder from './Encoder';
import ErrorCode from './ErrorCode';
import JsonAsync from './util/JsonAsync';
import Jwk from './util/Jwk';
import Jws from './util/Jws';
import OperationModel from './models/OperationModel';
import OperationType from '../../enums/OperationType';
import SidetreeError from '../../../common/SidetreeError';
import SignedDataModel from './models/DeactivateSignedDataModel';

/**
 * A class that represents a deactivate operation.
 */
export default class DeactivateOperation implements OperationModel {

  /** The original request buffer sent by the requester. */
  public readonly operationBuffer: Buffer;

  /** The unique suffix of the DID. */
  public readonly didUniqueSuffix: string;

  /** The type of operation. */
  public readonly type: OperationType;

  /** Signed data. */
  public readonly signedDataJws: Jws;

  /** Decoded signed data payload. */
  public readonly signedData: SignedDataModel;

  /**
   * NOTE: should only be used by `parse()` and `parseObject()` else the constructed instance could be invalid.
   */
  private constructor (
    operationBuffer: Buffer,
    didUniqueSuffix: string,
    signedDataJws: Jws,
    signedData: SignedDataModel
  ) {
    this.operationBuffer = operationBuffer;
    this.type = OperationType.Deactivate;
    this.didUniqueSuffix = didUniqueSuffix;
    this.signedDataJws = signedDataJws;
    this.signedData = signedData;
  }

  /**
   * Parses the given buffer as a `UpdateOperation`.
   */
  public static async parse (operationBuffer: Buffer): Promise<DeactivateOperation> {
    const operationJsonString = operationBuffer.toString();
    const operationObject = await JsonAsync.parse(operationJsonString);
    const deactivateOperation = await DeactivateOperation.parseObject(operationObject, operationBuffer);
    return deactivateOperation;
  }

  /**
   * Parses the given operation object as a `DeactivateOperation`.
   * The `operationBuffer` given is assumed to be valid and is assigned to the `operationBuffer` directly.
   * NOTE: This method is purely intended to be used as an optimization method over the `parse` method in that
   * JSON parsing is not required to be performed more than once when an operation buffer of an unknown operation type is given.
   */
  public static async parseObject (operationObject: any, operationBuffer: Buffer): Promise<DeactivateOperation> {
    const expectedPropertyCount = 3;

    const properties = Object.keys(operationObject);
    if (properties.length !== expectedPropertyCount) {
      throw new SidetreeError(ErrorCode.DeactivateOperationMissingOrUnknownProperty);
    }

    if (typeof operationObject.didSuffix !== 'string') {
      throw new SidetreeError(ErrorCode.DeactivateOperationMissingOrInvalidDidUniqueSuffix);
    }

    const signedDataJws = Jws.parseCompactJws(operationObject.signedData);
    const signedData = await DeactivateOperation.parseSignedDataPayload(
      signedDataJws.payload, operationObject.didSuffix);

    if (operationObject.type !== OperationType.Deactivate) {
      throw new SidetreeError(ErrorCode.DeactivateOperationTypeIncorrect);
    }

    return new DeactivateOperation(
      operationBuffer,
      operationObject.didSuffix,
      signedDataJws,
      signedData
    );
  }

  /**
   * Parses the signed data payload of a deactivate operation.
   */
  public static async parseSignedDataPayload (
    deltaEncodedString: string, expectedDidUniqueSuffix: string): Promise<SignedDataModel> {

    const signedDataJsonString = Encoder.decodeAsString(deltaEncodedString);
    const signedData = await JsonAsync.parse(signedDataJsonString);

    const properties = Object.keys(signedData);
    if (properties.length !== 2) {
      throw new SidetreeError(ErrorCode.DeactivateOperationSignedDataMissingOrUnknownProperty);
    }

    if (signedData.didSuffix !== expectedDidUniqueSuffix) {
      throw new SidetreeError(ErrorCode.DeactivateOperationSignedDidUniqueSuffixMismatch);
    }

    Jwk.validateJwkEs256k(signedData.recoveryKey);

    return signedData;
  }
}

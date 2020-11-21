import DeltaModel from './models/DeltaModel';
import Encoder from './Encoder';
import ErrorCode from './ErrorCode';
import JsonAsync from './util/JsonAsync';
import Jwk from './util/Jwk';
import Jws from './util/Jws';
import Multihash from './Multihash';
import Operation from './Operation';
import OperationModel from './models/OperationModel';
import OperationType from '../../enums/OperationType';
import SidetreeError from '../../../common/SidetreeError';
import SignedDataModel from './models/RecoverSignedDataModel';

/**
 * A class that represents a recover operation.
 */
export default class RecoverOperation implements OperationModel {

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

  /** Patch data. */
  public readonly delta: DeltaModel | undefined;

  /**
   * NOTE: should only be used by `parse()` and `parseObject()` else the constructed instance could be invalid.
   */
  private constructor (
    operationBuffer: Buffer,
    didUniqueSuffix: string,
    signedDataJws: Jws,
    signedData: SignedDataModel,
    delta: DeltaModel | undefined
  ) {
    this.operationBuffer = operationBuffer;
    this.type = OperationType.Recover;
    this.didUniqueSuffix = didUniqueSuffix;
    this.signedDataJws = signedDataJws;
    this.signedData = signedData;
    this.delta = delta;
  }

  /**
   * Parses the given buffer as a `RecoverOperation`.
   */
  public static async parse (operationBuffer: Buffer): Promise<RecoverOperation> {
    const operationJsonString = operationBuffer.toString();
    const operationObject = await JsonAsync.parse(operationJsonString);
    const recoverOperation = await RecoverOperation.parseObject(operationObject, operationBuffer);
    return recoverOperation;
  }

  /**
   * Parses the given operation object as a `RecoverOperation`.
   * The `operationBuffer` given is assumed to be valid and is assigned to the `operationBuffer` directly.
   * NOTE: This method is purely intended to be used as an optimization method over the `parse` method in that
   * JSON parsing is not required to be performed more than once when an operation buffer of an unknown operation type is given.
   */
  public static async parseObject (operationObject: any, operationBuffer: Buffer): Promise<RecoverOperation> {
    const expectedPropertyCount = 4;

    const properties = Object.keys(operationObject);
    if (properties.length !== expectedPropertyCount) {
      throw new SidetreeError(ErrorCode.RecoverOperationMissingOrUnknownProperty);
    }

    if (typeof operationObject.didSuffix !== 'string') {
      throw new SidetreeError(ErrorCode.RecoverOperationMissingOrInvalidDidUniqueSuffix);
    }

    const signedDataJws = Jws.parseCompactJws(operationObject.signedData);
    const signedData = await RecoverOperation.parseSignedDataPayload(signedDataJws.payload);

    if (operationObject.type !== OperationType.Recover) {
      throw new SidetreeError(ErrorCode.RecoverOperationTypeIncorrect);
    }

    let delta;
    try {
      Operation.validateDelta(operationObject.delta);
      delta = operationObject.delta;
    } catch {
      // For compatibility with data pruning, we have to assume that `delta` may be unavailable,
      // thus an operation with invalid `delta` needs to be processed as an operation with unavailable `delta`,
      // so here we let `delta` be `undefined`.
    }

    return new RecoverOperation(
      operationBuffer,
      operationObject.didSuffix,
      signedDataJws,
      signedData,
      delta
    );
  }

  /**
   * Parses the signed data payload of a recover operation.
   */
  public static async parseSignedDataPayload (signedDataEncodedString: string): Promise<SignedDataModel> {
    const signedDataJsonString = Encoder.decodeAsString(signedDataEncodedString);
    const signedData = await JsonAsync.parse(signedDataJsonString);

    const properties = Object.keys(signedData);
    if (properties.length !== 3) {
      throw new SidetreeError(ErrorCode.RecoverOperationSignedDataMissingOrUnknownProperty);
    }

    Jwk.validateJwkEs256k(signedData.recoveryKey);

    const deltaHash = Encoder.decodeAsBuffer(signedData.deltaHash);
    Multihash.verifyHashComputedUsingLatestSupportedAlgorithm(deltaHash);

    const nextRecoveryCommitmentHash = Encoder.decodeAsBuffer(signedData.recoveryCommitment);
    Multihash.verifyHashComputedUsingLatestSupportedAlgorithm(nextRecoveryCommitmentHash);

    return signedData;
  }
}

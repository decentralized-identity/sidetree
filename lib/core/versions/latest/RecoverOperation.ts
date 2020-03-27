import Encoder from './Encoder';
import ErrorCode from './ErrorCode';
import JsonAsync from './util/JsonAsync';
import Jws from './util/Jws';
import Multihash from './Multihash';
import Operation from './Operation';
import OperationDataModel from './models/OperationDataModel';
import OperationModel from './models/OperationModel';
import OperationType from '../../enums/OperationType';
import PublicKeyModel from '../../models/PublicKeyModel';
import SidetreeError from '../../../common/SidetreeError';

interface SignedOperationDataModel {
  operationDataHash: string;
  recoveryKey: PublicKeyModel;
  nextRecoveryCommitmentHash: string;
}

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

  /** Encoded reveal value for the operation. */
  public readonly recoveryRevealValue: string;

  /** Signed encoded operation data. */
  public readonly signedOperationDataJws: Jws;

  /** Encoded string of the operation data. */
  public readonly encodedOperationData: string | undefined;

  /** Decoded signed operation data payload. */
  public readonly signedOperationData: SignedOperationDataModel;

  /** Operation data. */
  public readonly operationData: OperationDataModel | undefined;

  /**
   * NOTE: should only be used by `parse()` and `parseObject()` else the constructed instance could be invalid.
   */
  private constructor (
    operationBuffer: Buffer,
    didUniqueSuffix: string,
    recoveryRevealValue: string,
    signedOperationDataJws: Jws,
    signedOperationData: SignedOperationDataModel,
    encodedOperationData: string | undefined,
    operationData: OperationDataModel | undefined
  ) {
    this.operationBuffer = operationBuffer;
    this.type = OperationType.Recover;
    this.didUniqueSuffix = didUniqueSuffix;
    this.recoveryRevealValue = recoveryRevealValue;
    this.signedOperationDataJws = signedOperationDataJws;
    this.signedOperationData = signedOperationData;
    this.encodedOperationData = encodedOperationData;
    this.operationData = operationData;
  }

  /**
   * Parses the given input as a recover operation entry in the anchor file.
   */
  public static async parseOpertionFromAnchorFile (input: any): Promise<RecoverOperation> {
    const opertionBuffer = Buffer.from(JSON.stringify(input));
    const operation = await RecoverOperation.parseObject(input, opertionBuffer, true);
    return operation;
  }

  /**
   * Parses the given buffer as a `UpdateOperation`.
   */
  public static async parse (operationBuffer: Buffer): Promise<RecoverOperation> {
    const operationJsonString = operationBuffer.toString();
    const operationObject = await JsonAsync.parse(operationJsonString);
    const recoverOperation = await RecoverOperation.parseObject(operationObject, operationBuffer, false);
    return recoverOperation;
  }

  /**
   * Parses the given operation object as a `RecoverOperation`.
   * The `operationBuffer` given is assumed to be valid and is assigned to the `operationBuffer` directly.
   * NOTE: This method is purely intended to be used as an optimization method over the `parse` method in that
   * JSON parsing is not required to be performed more than once when an operation buffer of an unknown operation type is given.
   * @param anchorFileMode If set to true, then `operationData` and `type` properties is expected to be absent.
   */
  public static async parseObject (operationObject: any, operationBuffer: Buffer, anchorFileMode: boolean): Promise<RecoverOperation> {
    let expectedPropertyCount = 5;
    if (anchorFileMode) {
      expectedPropertyCount = 3;
    }

    const properties = Object.keys(operationObject);
    if (properties.length !== expectedPropertyCount) {
      throw new SidetreeError(ErrorCode.RecoverOperationMissingOrUnknownProperty);
    }

    if (typeof operationObject.didUniqueSuffix !== 'string') {
      throw new SidetreeError(ErrorCode.RecoverOperationMissingOrInvalidDidUniqueSuffix);
    }

    if (typeof operationObject.recoveryRevealValue !== 'string') {
      throw new SidetreeError(ErrorCode.RecoverOperationRecoveryRevealValueMissingOrInvalidType);
    }

    if ((operationObject.recoveryRevealValue as string).length > Operation.maxEncodedRevealValueLength) {
      throw new SidetreeError(ErrorCode.RecoverOperationRecoveryRevealValueTooLong);
    }

    const recoveryRevealValue = operationObject.recoveryRevealValue;

    const signedOperationDataJws = Jws.parse(operationObject.signedOperationData);
    const signedOperationData = await RecoverOperation.parseSignedOperationDataPayload(signedOperationDataJws.payload);

    // If not in anchor file mode, we need to validate `type` and `operationData` properties.
    let encodedOperationData = undefined;
    let operationData = undefined;
    if (!anchorFileMode) {
      if (operationObject.type !== OperationType.Recover) {
        throw new SidetreeError(ErrorCode.RecoverOperationTypeIncorrect);
      }

      encodedOperationData = operationObject.operationData;
      try {
        operationData = await Operation.parseOperationData(operationObject.operationData);
      } catch {
        // For compatibility with data pruning, we have to assume that operation data may be unavailable,
        // thus an operation with invalid operation data needs to be processed as an operation with unavailable operation data,
        // so here we let operation data be `undefined`.
      }
    }

    return new RecoverOperation(
      operationBuffer,
      operationObject.didUniqueSuffix,
      recoveryRevealValue,
      signedOperationDataJws,
      signedOperationData,
      encodedOperationData,
      operationData
    );
  }

  private static async parseSignedOperationDataPayload (operationDataEncodedString: string): Promise<SignedOperationDataModel> {
    const signedOperationDataJsonString = Encoder.decodeAsString(operationDataEncodedString);
    const signedOperationData = await JsonAsync.parse(signedOperationDataJsonString);

    const properties = Object.keys(signedOperationData);
    if (properties.length !== 3) {
      throw new SidetreeError(ErrorCode.RecoverOperationSignedDataMissingOrUnknownProperty);
    }

    Operation.validateRecoveryKeyObject(signedOperationData.recoveryKey);

    const operationDataHash = Encoder.decodeAsBuffer(signedOperationData.operationDataHash);
    Multihash.verifyHashComputedUsingLatestSupportedAlgorithm(operationDataHash);

    const nextRecoveryCommitmentHash = Encoder.decodeAsBuffer(signedOperationData.nextRecoveryCommitmentHash);
    Multihash.verifyHashComputedUsingLatestSupportedAlgorithm(nextRecoveryCommitmentHash);

    return signedOperationData;
  }
}

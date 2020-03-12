import Encoder from './Encoder';
import ErrorCode from './ErrorCode';
import JsonAsync from './util/JsonAsync';
import Jws from './util/Jws';
import Multihash from './Multihash';
import Operation from './Operation';
import OperationModel from './models/OperationModel';
import OperationType from '../../enums/OperationType';
import PublicKeyModel from '../../models/PublicKeyModel';
import SidetreeError from '../../../common/SidetreeError';

interface SignedOperationDataModel {
  operationDataHash: string;
  recoveryKey: PublicKeyModel;
  nextRecoveryOtpHash: string;
}

interface OperationDataModel {
  nextUpdateOtpHash: string;
  document: any;
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

  /** Encoded one-time password for the operation. */
  public readonly recoveryOtp: string;

  /** Signed encoded operation data. */
  public readonly signedOperationDataJws: Jws;

  /** Encoded string of the operation data. */
  public readonly encodedOperationData: string;

  /** Decoded signed operation data payload. */
  public readonly signedOperationData: SignedOperationDataModel;

  /** Operation data. */
  public readonly operationData: OperationDataModel;

  /**
   * NOTE: should only be used by `parse()` and `parseObject()` else the contructed instance could be invalid.
   */
  private constructor (
    operationBuffer: Buffer,
    didUniqueSuffix: string,
    recoveryOtp: string,
    signedOperationDataJws: Jws,
    encodedOperationData: string,
    signedOperationData: SignedOperationDataModel,
    operationData: OperationDataModel
  ) {
    this.operationBuffer = operationBuffer;
    this.type = OperationType.Recover;
    this.didUniqueSuffix = didUniqueSuffix;
    this.recoveryOtp = recoveryOtp;
    this.signedOperationDataJws = signedOperationDataJws;
    this.encodedOperationData = encodedOperationData;
    this.signedOperationData = signedOperationData;
    this.operationData = operationData;
  }

  /**
   * Parses the given buffer as a `UpdateOperation`.
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
    const properties = Object.keys(operationObject);
    if (properties.length !== 5) {
      throw new SidetreeError(ErrorCode.RecoverOperationMissingOrUnknownProperty);
    }

    if (operationObject.type !== OperationType.Recover) {
      throw new SidetreeError(ErrorCode.RecoverOperationTypeIncorrect);
    }

    if (typeof operationObject.didUniqueSuffix !== 'string') {
      throw new SidetreeError(ErrorCode.RecoverOperationMissingOrInvalidDidUniqueSuffix);
    }

    if (typeof operationObject.recoveryOtp !== 'string') {
      throw new SidetreeError(ErrorCode.RecoverOperationRecoveryOtpMissingOrInvalidType);
    }

    if ((operationObject.recoveryOtp as string).length > Operation.maxEncodedOtpLength) {
      throw new SidetreeError(ErrorCode.RecoverOperationRecoveryOtpTooLong);
    }

    const recoveryOtp = operationObject.recoveryOtp;

    const signedOperationDataJws = Jws.parse(operationObject.signedOperationData);
    const signedOperationData = await RecoverOperation.parseSignedOperationDataPayload(signedOperationDataJws.payload);

    const encodedOperationData = operationObject.operationData;
    const operationData = await RecoverOperation.parseOperationData(encodedOperationData);

    return new RecoverOperation(
      operationBuffer,
      operationObject.didUniqueSuffix,
      recoveryOtp,
      signedOperationDataJws,
      encodedOperationData,
      signedOperationData,
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

    const nextRecoveryOtpHash = Encoder.decodeAsBuffer(signedOperationData.nextRecoveryOtpHash);
    Multihash.verifyHashComputedUsingLatestSupportedAlgorithm(nextRecoveryOtpHash);

    return signedOperationData;
  }

  private static async parseOperationData (operationDataEncodedString: any): Promise<OperationDataModel> {
    if (typeof operationDataEncodedString !== 'string') {
      throw new SidetreeError(ErrorCode.RecoverOperationDataMissingOrNotString);
    }

    const operationDataJsonString = Encoder.decodeAsString(operationDataEncodedString);
    const operationData = await JsonAsync.parse(operationDataJsonString);

    const properties = Object.keys(operationData);
    if (properties.length !== 2) {
      throw new SidetreeError(ErrorCode.RecoverOperationDataMissingOrUnknownProperty);
    }

    if (operationData.document === undefined) {
      throw new SidetreeError(ErrorCode.RecoverOperationDocumentMissing);
    }

    const nextUpdateOtpHash = Encoder.decodeAsBuffer(operationData.nextUpdateOtpHash);
    Multihash.verifyHashComputedUsingLatestSupportedAlgorithm(nextUpdateOtpHash);

    return operationData;
  }
}

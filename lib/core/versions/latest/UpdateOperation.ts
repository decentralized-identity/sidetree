import DocumentComposer from './DocumentComposer';
import Encoder from './Encoder';
import ErrorCode from './ErrorCode';
import JsonAsync from './util/JsonAsync';
import Jws from './util/Jws';
import Multihash from './Multihash';
import Operation from './Operation';
import OperationModel from './models/OperationModel';
import OperationType from '../../enums/OperationType';
import SidetreeError from '../../SidetreeError';

interface OperationDataModel {
  nextUpdateOtpHash: string;
  documentPatch: any;
}

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
  public readonly operationData: OperationDataModel;

  /** Encoded string of the operation data. */
  public readonly encodedOperationData: string;

  /**
   * NOTE: should only be used by `parse()` and `parseObject()` else the contructed instance could be invalid.
   */
  private constructor (
    operationBuffer: Buffer,
    didUniqueSuffix: string,
    updateOtp: string,
    signedOperationDataHash: Jws,
    encodedOperationData: string,
    operationData: OperationDataModel) {
    this.operationBuffer = operationBuffer;
    this.type = OperationType.Update;
    this.didUniqueSuffix = didUniqueSuffix;
    this.updateOtp = updateOtp;
    this.signedOperationDataHash = signedOperationDataHash;
    this.encodedOperationData = encodedOperationData;
    this.operationData = operationData;
  }

  /**
   * Parses the given buffer as a `UpdateOperation`.
   */
  public static async parse (operationBuffer: Buffer): Promise<UpdateOperation> {
    const operationJsonString = operationBuffer.toString();
    const operationObject = await JsonAsync.parse(operationJsonString);
    const updateOperation = await UpdateOperation.parseObject(operationObject, operationBuffer);
    return updateOperation;
  }

  /**
   * Parses the given operation object as a `UpdateOperation`.
   * The `operationBuffer` given is assumed to be valid and is assigned to the `operationBuffer` directly.
   * NOTE: This method is purely intended to be used as an optimization method over the `parse` method in that
   * JSON parsing is not required to be performed more than once when an operation buffer of an unknown operation type is given.
   */
  public static async parseObject (operationObject: any, operationBuffer: Buffer): Promise<UpdateOperation> {
    const properties = Object.keys(operationObject);
    if (properties.length !== 5) {
      throw new SidetreeError(ErrorCode.UpdateOperationMissingOrUnknownProperty);
    }

    if (operationObject.type !== OperationType.Update) {
      throw new SidetreeError(ErrorCode.UpdateOperationTypeIncorrect);
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

    const encodedOperationData = operationObject.operationData;
    const operationData = await UpdateOperation.parseOperationData(encodedOperationData);

    return new UpdateOperation(operationBuffer, operationObject.didUniqueSuffix, updateOtp, signedOperationDataHash, encodedOperationData, operationData);
  }

  private static async parseOperationData (operationDataEncodedString: any): Promise<OperationDataModel> {
    if (typeof operationDataEncodedString !== 'string') {
      throw new SidetreeError(ErrorCode.UpdateOperationDataMissingOrNotString);
    }

    const operationDataJsonString = Encoder.decodeAsString(operationDataEncodedString);
    const operationData = await JsonAsync.parse(operationDataJsonString);

    const properties = Object.keys(operationData);
    if (properties.length !== 2) {
      throw new SidetreeError(ErrorCode.UpdateOperationDataMissingOrUnknownProperty);
    }

    if (operationData.documentPatch === undefined) {
      throw new SidetreeError(ErrorCode.UpdateOperationDocumentPatchMissing);
    }

    // Validate `documentPatch` property using the DocumentComposer.
    DocumentComposer.validateDocumentPatch(operationData.documentPatch);

    const nextUpdateOtpHash = Encoder.decodeAsBuffer(operationData.nextUpdateOtpHash);
    Multihash.verifyHashComputedUsingLatestSupportedAlgorithm(nextUpdateOtpHash);

    return operationData;
  }
}

import Encoder from './Encoder';
import ErrorCode from './ErrorCode';
import JsonAsync from './util/JsonAsync';
import Multihash from './Multihash';
import OperationModel from './models/OperationModel';
import OperationType from '../../enums/OperationType';
import SidetreeError from '../../SidetreeError';

interface SuffixDataModel {
  operationDataHash: string;
  recoveryKey: string;
  nextRecoveryOtpHash: string;
}

interface OperationDataModel {
  nextUpdateOtpHash: string;
  document: string;
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

  /** Operation data. */
  public readonly operationData: OperationDataModel;

  /**
   * Constructs an Operation if the operation buffer passes schema validation, throws error otherwise.
   */
  private constructor (operationBuffer: Buffer, didUniqueSuffix: string, suffixData: SuffixDataModel, operationData: OperationDataModel) {
    this.type = OperationType.Create;
    this.operationBuffer = operationBuffer;
    this.suffixData = suffixData;
    this.operationData = operationData;
    this.didUniqueSuffix = didUniqueSuffix;
  }

  /**
   * Computes the cryptographic multihash of the given string.
   */
  private static computeHash (encodedString: string): string {
    const dataBuffer = Encoder.decodeAsBuffer(encodedString);
    const multihash = Multihash.hash(dataBuffer);
    const encodedMultihash = Encoder.encode(multihash);
    return encodedMultihash;
  }

  /**
   * Parses the given buffer as a `CreateOperation`.
   */
  public static async parse (operationBuffer: Buffer): Promise<CreateOperation> {
    const operationJsonString = operationBuffer.toString();
    const operationObject = await JsonAsync.parse(operationJsonString);
    const createOperation = await CreateOperation.parseObject(operationObject, operationBuffer);
    return createOperation;
  }

  /**
   * Parses the given operation object as a `CreateOperation`.
   * The `operationBuffer` given is assumed to be valid and is assigned to the `operationBuffer` directly.
   * NOTE: This method is purely intended to be used as an optimization method over the `parse` method in that
   * JSON parsing is not required to be performed more than once when an operation buffer of an unknown operation type is given.
   */
  public static async parseObject (operationObject: any, operationBuffer: Buffer): Promise<CreateOperation> {
    const properties = Object.keys(operationObject);
    if (properties.length !== 3) {
      throw new SidetreeError(ErrorCode.CreateOperationMissingOrUnknownProperty);
    }

    if (operationObject.type !== OperationType.Create) {
      throw new SidetreeError(ErrorCode.CreateOperationTypeIncorrect);
    }

    const suffixData = await CreateOperation.parseSuffixData(operationObject.suffixData);
    const operationData = await CreateOperation.parseOperationData(operationObject.operationData);

    const didUniqueSuffix = CreateOperation.computeHash(operationObject.suffixData);
    return new CreateOperation(operationBuffer, didUniqueSuffix, suffixData, operationData);
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

    if (suffixData.recoveryKey === undefined) {
      throw new SidetreeError(ErrorCode.CreateOperationRecoveryKeyMissing);
    }

    const recoveryKeyObjectPropertyCount = Object.keys(suffixData.recoveryKey);
    if (recoveryKeyObjectPropertyCount.length !== 1 ||
        typeof suffixData.recoveryKey.publicKeyHex !== 'string') {
      throw new SidetreeError(ErrorCode.CreateOperationRecoveryKeyInvalid);
    }

    const operationDataHash = Encoder.decodeAsBuffer(suffixData.operationDataHash);
    const nextRecoveryOtpHash = Encoder.decodeAsBuffer(suffixData.nextRecoveryOtpHash);

    Multihash.verifyHashComputedUsingLatestSupportedAlgorithm(operationDataHash);
    Multihash.verifyHashComputedUsingLatestSupportedAlgorithm(nextRecoveryOtpHash);

    return suffixData;
  }

  private static async parseOperationData (operationDataEncodedString: any): Promise<OperationDataModel> {
    if (typeof operationDataEncodedString !== 'string') {
      throw new SidetreeError(ErrorCode.CreateOperationDataMissingOrNotString);
    }

    const operationDataJsonString = Encoder.decodeAsString(operationDataEncodedString);
    const operationData = await JsonAsync.parse(operationDataJsonString);

    const properties = Object.keys(operationData);
    if (properties.length !== 2) {
      throw new SidetreeError(ErrorCode.CreateOperationDataMissingOrUnknownProperty);
    }

    if (operationData.document === undefined) {
      throw new SidetreeError(ErrorCode.CreateOperationDocumentMissing);
    }

    const nextUpdateOtpHash = Encoder.decodeAsBuffer(operationData.nextUpdateOtpHash);
    Multihash.verifyHashComputedUsingLatestSupportedAlgorithm(nextUpdateOtpHash);

    return operationData;
  }
}

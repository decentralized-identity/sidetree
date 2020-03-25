import CreateOperation from './CreateOperation';
import DocumentComposer from './DocumentComposer';
import Encoder from './Encoder';
import ErrorCode from './ErrorCode';
import JsonAsync from './util/JsonAsync';
import Multihash from './Multihash';
import OperationDataModel from './models/OperationDataModel';
import OperationModel from './models/OperationModel';
import OperationType from '../../enums/OperationType';
import RecoverOperation from './RecoverOperation';
import RevokeOperation from './RevokeOperation';
import SidetreeError from '../../../common/SidetreeError';
import UpdateOperation from './UpdateOperation';

/**
 * A class that contains Sidetree operation utility methods.
 */
export default class Operation {
  /** Maximum allowed encoded OTP string length. */
  public static readonly maxEncodedOtpLength = 50;

  /**
   * Parses the given buffer into an `OperationModel`.
   */
  public static async parse (operationBuffer: Buffer): Promise<OperationModel> {
    // Parse request buffer into a JS object.
    const operationJsonString = operationBuffer.toString();
    const operationObject = JSON.parse(operationJsonString);
    const operationType = operationObject.type;
    const isAnchorFileMode = false;

    if (operationType === OperationType.Create) {
      return CreateOperation.parseObject(operationObject, operationBuffer, isAnchorFileMode);
    } else if (operationType === OperationType.Update) {
      return UpdateOperation.parseObject(operationObject, operationBuffer, isAnchorFileMode);
    } else if (operationType === OperationType.Recover) {
      return RecoverOperation.parseObject(operationObject, operationBuffer, isAnchorFileMode);
    } else if (operationType === OperationType.Revoke) {
      return RevokeOperation.parseObject(operationObject, operationBuffer, isAnchorFileMode);
    } else {
      throw new SidetreeError(ErrorCode.OperationTypeUnknownOrMissing);
    }
  }

  /**
   * Parses the given encoded operation data string.
   */
  public static async parseOperationData (operationDataEncodedString: any): Promise<OperationDataModel> {
    if (typeof operationDataEncodedString !== 'string') {
      throw new SidetreeError(ErrorCode.OperationDataMissingOrNotString);
    }

    const operationDataJsonString = Encoder.decodeAsString(operationDataEncodedString);
    const operationData = await JsonAsync.parse(operationDataJsonString);

    const properties = Object.keys(operationData);
    if (properties.length !== 2) {
      throw new SidetreeError(ErrorCode.OperationDataMissingOrUnknownProperty);
    }

    if (operationData.patches === undefined) {
      throw new SidetreeError(ErrorCode.OperationDocumentPatchesMissing);
    }

    // Validate `patches` property using the DocumentComposer.
    DocumentComposer.validateDocumentPatches(operationData.patches);

    const nextUpdateOtpHash = Encoder.decodeAsBuffer(operationData.nextUpdateOtpHash);
    Multihash.verifyHashComputedUsingLatestSupportedAlgorithm(nextUpdateOtpHash);

    return operationData;
  }

  /**
   * Validates the given recovery key object is in valid format.
   * @throws SidetreeError if given recovery key is invalid.
   */
  public static validateRecoveryKeyObject (recoveryKey: any) {
    if (recoveryKey === undefined) {
      throw new SidetreeError(ErrorCode.OperationRecoveryKeyUndefined);
    }

    const recoveryKeyObjectPropertyCount = Object.keys(recoveryKey);
    if (recoveryKeyObjectPropertyCount.length !== 1 ||
        typeof recoveryKey.publicKeyHex !== 'string') {
      throw new SidetreeError(ErrorCode.OperationRecoveryKeyInvalid);
    }
  }
}

import CreateOperation from './CreateOperation';
import DocumentComposer from './DocumentComposer';
import Encoder from './Encoder';
import ErrorCode from './ErrorCode';
import JsonAsync from './util/JsonAsync';
import Multihash from './Multihash';
import OperationModel from './models/OperationModel';
import OperationType from '../../enums/OperationType';
import PatchDataModel from './models/PatchDataModel';
import RecoverOperation from './RecoverOperation';
import RevokeOperation from './RevokeOperation';
import SidetreeError from '../../../common/SidetreeError';
import UpdateOperation from './UpdateOperation';

/**
 * A class that contains Sidetree operation utility methods.
 */
export default class Operation {
  /** Maximum allowed encoded reveal value string length. */
  public static readonly maxEncodedRevealValueLength = 50;

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
   * Parses the given encoded patch data string.
   */
  public static async parsePatchData (patchDataEncodedString: any): Promise<PatchDataModel> {
    if (typeof patchDataEncodedString !== 'string') {
      throw new SidetreeError(ErrorCode.PatchDataMissingOrNotString);
    }

    const patchDataJsonString = Encoder.decodeAsString(patchDataEncodedString);
    const patchData = await JsonAsync.parse(patchDataJsonString);

    const properties = Object.keys(patchData);
    if (properties.length !== 2) {
      throw new SidetreeError(ErrorCode.PatchDataMissingOrUnknownProperty);
    }

    if (patchData.patches === undefined) {
      throw new SidetreeError(ErrorCode.OperationDocumentPatchesMissing);
    }

    // Validate `patches` property using the DocumentComposer.
    DocumentComposer.validateDocumentPatches(patchData.patches);

    const nextUpdateCommitmentHash = Encoder.decodeAsBuffer(patchData.nextUpdateCommitmentHash);
    Multihash.verifyHashComputedUsingLatestSupportedAlgorithm(nextUpdateCommitmentHash);

    return patchData;
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

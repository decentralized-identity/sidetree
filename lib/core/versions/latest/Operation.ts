import CreateOperation from './CreateOperation';
import DeactivateOperation from './DeactivateOperation';
import DocumentComposer from './DocumentComposer';
import ErrorCode from './ErrorCode';
import InputValidator from './InputValidator';
import OperationModel from './models/OperationModel';
import OperationType from '../../enums/OperationType';
import RecoverOperation from './RecoverOperation';
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

    if (operationType === OperationType.Create) {
      return CreateOperation.parseObject(operationObject, operationBuffer);
    } else if (operationType === OperationType.Update) {
      return UpdateOperation.parseObject(operationObject, operationBuffer);
    } else if (operationType === OperationType.Recover) {
      return RecoverOperation.parseObject(operationObject, operationBuffer);
    } else if (operationType === OperationType.Deactivate) {
      return DeactivateOperation.parseObject(operationObject, operationBuffer);
    } else {
      throw new SidetreeError(ErrorCode.OperationTypeUnknownOrMissing);
    }
  }

  /**
   * validate delta and throw if invalid
   * @param delta the delta to validate
   */
  public static validateDelta (delta: any): void {
    InputValidator.validateNonArrayObject(delta, 'delta');
    InputValidator.validateObjectContainsOnlyAllowedProperties(delta, ['patches', 'updateCommitment'], 'delta');

    // Validate `patches` property using the DocumentComposer.
    DocumentComposer.validateDocumentPatches(delta.patches);

    InputValidator.validateEncodedMultihash(delta.updateCommitment, 'update commitment');
  }
}

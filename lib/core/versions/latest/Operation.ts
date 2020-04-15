import CreateOperation from './CreateOperation';
import DeactivateOperation from './DeactivateOperation';
import DeltaModel from './models/DeltaModel';
import DocumentComposer from './DocumentComposer';
import Encoder from './Encoder';
import ErrorCode from './ErrorCode';
import JsonAsync from './util/JsonAsync';
import Multihash from './Multihash';
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
    const isAnchorFileMode = false;

    if (operationType === OperationType.Create) {
      return CreateOperation.parseObject(operationObject, operationBuffer, isAnchorFileMode);
    } else if (operationType === OperationType.Update) {
      return UpdateOperation.parseObject(operationObject, operationBuffer, isAnchorFileMode);
    } else if (operationType === OperationType.Recover) {
      return RecoverOperation.parseObject(operationObject, operationBuffer, isAnchorFileMode);
    } else if (operationType === OperationType.Deactivate) {
      return DeactivateOperation.parseObject(operationObject, operationBuffer, isAnchorFileMode);
    } else {
      throw new SidetreeError(ErrorCode.OperationTypeUnknownOrMissing);
    }
  }

  /**
   * Parses the given encoded delta string into an internal `DeltaModel`.
   */
  public static async parseDelta (deltaEncodedString: any): Promise<DeltaModel> {
    if (typeof deltaEncodedString !== 'string') {
      throw new SidetreeError(ErrorCode.DeltaMissingOrNotString);
    }

    const deltaJsonString = Encoder.decodeAsString(deltaEncodedString);
    const delta = await JsonAsync.parse(deltaJsonString);

    const properties = Object.keys(delta);
    if (properties.length !== 2) {
      throw new SidetreeError(ErrorCode.DeltaMissingOrUnknownProperty);
    }

    if (delta.patches === undefined) {
      throw new SidetreeError(ErrorCode.OperationDocumentPatchesMissing);
    }

    // Validate `patches` property using the DocumentComposer.
    DocumentComposer.validateDocumentPatches(delta.patches);

    const nextUpdateCommitment = Encoder.decodeAsBuffer(delta.update_commitment);
    Multihash.verifyHashComputedUsingLatestSupportedAlgorithm(nextUpdateCommitment);

    return {
      patches: delta.patches,
      updateCommitment: delta.update_commitment
    };
  }
}

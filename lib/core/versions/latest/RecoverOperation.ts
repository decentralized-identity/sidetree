import DeltaModel from './models/DeltaModel';
import Encoder from './Encoder';
import ErrorCode from './ErrorCode';
import InputValidator from './InputValidator';
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
  /** The type of operation. */
  public readonly type: OperationType = OperationType.Recover;

  /**
   * NOTE: should only be used by `parse()` and `parseObject()` else the constructed instance could be invalid.
   */
  private constructor (
    public readonly operationBuffer: Buffer,
    public readonly didUniqueSuffix: string,
    public readonly revealValue: string,
    public readonly signedDataJws: Jws,
    public readonly signedData: SignedDataModel,
    public readonly delta: DeltaModel | undefined
  ) { }

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
    InputValidator.validateObjectContainsOnlyAllowedProperties(
      operationObject, ['type', 'didSuffix', 'revealValue', 'signedData', 'delta'], 'recover request'
    );

    if (operationObject.type !== OperationType.Recover) {
      throw new SidetreeError(ErrorCode.RecoverOperationTypeIncorrect);
    }

    InputValidator.validateEncodedMultihash(operationObject.didSuffix, 'recover request didSuffix');
    InputValidator.validateEncodedMultihash(operationObject.revealValue, 'recover request reveal value');

    const signedDataJws = Jws.parseCompactJws(operationObject.signedData);
    const signedDataModel = await RecoverOperation.parseSignedDataPayload(signedDataJws.payload);

    // Validate that the canonicalized recovery public key hash is the same as `revealValue`.
    Multihash.validateCanonicalizeObjectHash(signedDataModel.recoveryKey, operationObject.revealValue, 'recover request recovery key');

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
      operationObject.revealValue,
      signedDataJws,
      signedDataModel,
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

    InputValidator.validateEncodedMultihash(signedData.deltaHash, 'recover operation delta hash');
    InputValidator.validateEncodedMultihash(signedData.recoveryCommitment, 'recover operation next recovery commitment');

    return signedData;
  }
}

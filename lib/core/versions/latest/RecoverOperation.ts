import Encoder from './Encoder';
import ErrorCode from './ErrorCode';
import JsonAsync from './util/JsonAsync';
import Jwk from './util/Jwk';
import JwkEs256k from '../../models/JwkEs256k';
import Jws from './util/Jws';
import Multihash from './Multihash';
import Operation from './Operation';
import OperationModel from './models/OperationModel';
import OperationType from '../../enums/OperationType';
import PatchDataModel from './models/PatchDataModel';
import SidetreeError from '../../../common/SidetreeError';

interface SignedDataModel {
  patchDataHash: string;
  recoveryKey: JwkEs256k;
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

  /** Signed data. */
  public readonly signedDataJws: Jws;

  /** Encoded string of the patch data. */
  public readonly encodedPatchData: string | undefined;

  /** Decoded signed data payload. */
  public readonly signedData: SignedDataModel;

  /** Patch data. */
  public readonly patchData: PatchDataModel | undefined;

  /**
   * NOTE: should only be used by `parse()` and `parseObject()` else the constructed instance could be invalid.
   */
  private constructor (
    operationBuffer: Buffer,
    didUniqueSuffix: string,
    recoveryRevealValue: string,
    signedDataJws: Jws,
    signedData: SignedDataModel,
    encodedPatchData: string | undefined,
    patchData: PatchDataModel | undefined
  ) {
    this.operationBuffer = operationBuffer;
    this.type = OperationType.Recover;
    this.didUniqueSuffix = didUniqueSuffix;
    this.recoveryRevealValue = recoveryRevealValue;
    this.signedDataJws = signedDataJws;
    this.signedData = signedData;
    this.encodedPatchData = encodedPatchData;
    this.patchData = patchData;
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
   * @param anchorFileMode If set to true, then `patchData` and `type` properties are expected to be absent.
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

    const expectKidInHeader = false;
    const signedDataJws = Jws.parseCompactJws(operationObject.signedData, expectKidInHeader);
    const signedData = await RecoverOperation.parseSignedDataPayload(signedDataJws.payload);

    // If not in anchor file mode, we need to validate `type` and `patchData` properties.
    let encodedPatchData = undefined;
    let patchData = undefined;
    if (!anchorFileMode) {
      if (operationObject.type !== OperationType.Recover) {
        throw new SidetreeError(ErrorCode.RecoverOperationTypeIncorrect);
      }

      encodedPatchData = operationObject.patchData;
      try {
        patchData = await Operation.parsePatchData(operationObject.patchData);
      } catch {
        // For compatibility with data pruning, we have to assume that patch data may be unavailable,
        // thus an operation with invalid patch data needs to be processed as an operation with unavailable patch data,
        // so here we let patch data be `undefined`.
      }
    }

    return new RecoverOperation(
      operationBuffer,
      operationObject.didUniqueSuffix,
      recoveryRevealValue,
      signedDataJws,
      signedData,
      encodedPatchData,
      patchData
    );
  }

  private static async parseSignedDataPayload (signedDataEncodedString: string): Promise<SignedDataModel> {
    const signedDataJsonString = Encoder.decodeAsString(signedDataEncodedString);
    const signedData = await JsonAsync.parse(signedDataJsonString);

    const properties = Object.keys(signedData);
    if (properties.length !== 3) {
      throw new SidetreeError(ErrorCode.RecoverOperationSignedDataMissingOrUnknownProperty);
    }

    Jwk.validateJwkEs256k(signedData.recoveryKey);

    const patchDataHash = Encoder.decodeAsBuffer(signedData.patchDataHash);
    Multihash.verifyHashComputedUsingLatestSupportedAlgorithm(patchDataHash);

    const nextRecoveryCommitmentHash = Encoder.decodeAsBuffer(signedData.nextRecoveryCommitmentHash);
    Multihash.verifyHashComputedUsingLatestSupportedAlgorithm(nextRecoveryCommitmentHash);

    return signedData;
  }
}

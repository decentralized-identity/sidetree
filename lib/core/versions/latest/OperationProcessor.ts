import AnchoredOperationModel from '../../models/AnchoredOperationModel';
import CreateOperation from './CreateOperation';
import DeactivateOperation from './DeactivateOperation';
import DidState from '../../models/DidState';
import DocumentComposer from './DocumentComposer';
import Encoder from './Encoder';
import ErrorCode from './ErrorCode';
import IOperationProcessor from '../../interfaces/IOperationProcessor';
import JsonCanonicalizer from './util/JsonCanonicalizer';
import Logger from '../../../common/Logger';
import Multihash from './Multihash';
import Operation from './Operation';
import OperationType from '../../enums/OperationType';
import RecoverOperation from './RecoverOperation';
import SidetreeError from '../../../common/SidetreeError';
import UpdateOperation from './UpdateOperation';

/**
 * Implementation of IOperationProcessor.
 */
export default class OperationProcessor implements IOperationProcessor {

  public async apply (
    anchoredOperationModel: AnchoredOperationModel,
    didState: DidState | undefined
  ): Promise<DidState | undefined> {
    // If DID state is undefined, then the operation given must be a create operation, otherwise the operation cannot be applied.
    if (didState === undefined && anchoredOperationModel.type !== OperationType.Create) {
      return undefined;
    }

    const previousOperationTransactionNumber = didState ? didState.lastOperationTransactionNumber : undefined;

    let appliedDidState: DidState | undefined;
    if (anchoredOperationModel.type === OperationType.Create) {
      appliedDidState = await this.applyCreateOperation(anchoredOperationModel, didState);
    } else if (anchoredOperationModel.type === OperationType.Update) {
      appliedDidState = await this.applyUpdateOperation(anchoredOperationModel, didState!);
    } else if (anchoredOperationModel.type === OperationType.Recover) {
      appliedDidState = await this.applyRecoverOperation(anchoredOperationModel, didState!);
    } else if (anchoredOperationModel.type === OperationType.Deactivate) {
      appliedDidState = await this.applyDeactivateOperation(anchoredOperationModel, didState!);
    } else {
      throw new SidetreeError(ErrorCode.OperationProcessorUnknownOperationType);
    }

    try {
      // If the operation was not applied, log some info in case needed for debugging.
      if (appliedDidState === undefined ||
          appliedDidState.lastOperationTransactionNumber === previousOperationTransactionNumber) {
        const index = anchoredOperationModel.operationIndex;
        const time = anchoredOperationModel.transactionTime;
        const number = anchoredOperationModel.transactionNumber;
        const didUniqueSuffix = anchoredOperationModel.didUniqueSuffix;
        Logger.info(`Ignored invalid operation for DID '${didUniqueSuffix}' in transaction '${number}' at time '${time}' at operation index ${index}.`);
      }
    } catch (error) {
      Logger.info(`Failed logging ${error}.`);
      // If logging fails, just move on.
    }

    return appliedDidState;
  }

  public async getMultihashRevealValue (anchoredOperationModel: AnchoredOperationModel): Promise<Buffer> {
    if (anchoredOperationModel.type === OperationType.Create) {
      throw new SidetreeError(ErrorCode.OperationProcessorCreateOperationDoesNotHaveRevealValue);
    }

    const operation = await Operation.parse(anchoredOperationModel.operationBuffer);

    const multihashRevealValue = (operation as RecoverOperation | UpdateOperation | DeactivateOperation).revealValue;
    const multihashRevealValueBuffer = Encoder.decodeAsBuffer(multihashRevealValue);
    return multihashRevealValueBuffer;
  }

  /**
   * @returns new DID state if operation is applied successfully; the given DID state otherwise.
   */
  private async applyCreateOperation (
    anchoredOperationModel: AnchoredOperationModel,
    didState: DidState | undefined
  ): Promise<DidState | undefined> {
    // If DID state is already created by a previous create operation, then we cannot apply a create operation again.
    if (didState !== undefined) {
      return didState;
    }

    // When delta parsing fails, operation.delta is undefined.
    const operation = await CreateOperation.parse(anchoredOperationModel.operationBuffer);

    const newDidState: DidState = {
      document: { },
      nextRecoveryCommitmentHash: operation.suffixData.recoveryCommitment,
      nextUpdateCommitmentHash: undefined,
      lastOperationTransactionNumber: anchoredOperationModel.transactionNumber
    };

    if (operation.delta === undefined) {
      return newDidState;
    }

    // Verify the delta hash against the expected delta hash.
    const deltaPayload = JsonCanonicalizer.canonicalizeAsBuffer({
      updateCommitment: operation.delta.updateCommitment,
      patches: operation.delta.patches
    });

    // If code execution gets to this point, delta is defined.

    const isMatchingDelta = Multihash.verifyEncodedMultihashForContent(deltaPayload, operation.suffixData.deltaHash);
    if (!isMatchingDelta) {
      return newDidState;
    };

    // Apply the given patches against an empty object.
    const delta = operation.delta;
    let document = { };

    // update the commitment hash regardless
    newDidState.nextUpdateCommitmentHash = delta.updateCommitment;
    try {
      document = DocumentComposer.applyPatches(document, delta.patches);
      newDidState.document = document;
    } catch (error) {
      const didUniqueSuffix = anchoredOperationModel.didUniqueSuffix;
      const transactionNumber = anchoredOperationModel.transactionNumber;
      Logger.info(
        `Partial update on next commitment hash applied because: ` +
        `Unable to apply delta patches for transaction number ${transactionNumber} for DID ${didUniqueSuffix}: ${SidetreeError.stringify(error)}.`);
    }

    return newDidState;
  }

  /**
   * @returns new DID state if operation is applied successfully; the given DID state otherwise.
   */
  private async applyUpdateOperation (
    anchoredOperationModel: AnchoredOperationModel,
    didState: DidState
  ): Promise<DidState> {

    const operation = await UpdateOperation.parse(anchoredOperationModel.operationBuffer);

    // Verify the update key hash.
    const isValidUpdateKey = Multihash.canonicalizeAndVerifyDoubleHash(operation.signedData.updateKey, didState.nextUpdateCommitmentHash!);
    if (!isValidUpdateKey) {
      return didState;
    }

    // Verify the signature.
    const signatureIsValid = await operation.signedDataJws.verifySignature(operation.signedData.updateKey);
    if (!signatureIsValid) {
      return didState;
    }

    // Verify the delta hash against the expected delta hash.
    const deltaPayload = operation.delta ? JsonCanonicalizer.canonicalizeAsBuffer({
      updateCommitment: operation.delta.updateCommitment,
      patches: operation.delta.patches
    }) : undefined;
    if (deltaPayload === undefined) {
      return didState;
    };

    const isMatchingDelta = Multihash.verifyEncodedMultihashForContent(deltaPayload, operation.signedData.deltaHash);
    if (!isMatchingDelta) {
      return didState;
    };

    let resultingDocument;
    try {
      resultingDocument = await DocumentComposer.applyUpdateOperation(operation, didState.document);
    } catch (error) {
      const didUniqueSuffix = anchoredOperationModel.didUniqueSuffix;
      const transactionNumber = anchoredOperationModel.transactionNumber;
      Logger.info(`Unable to apply document patch in transaction number ${transactionNumber} for DID ${didUniqueSuffix}: ${SidetreeError.stringify(error)}.`);

      // Return the given DID state if error is encountered applying the patches.
      return didState;
    }

    const newDidState = {
      nextRecoveryCommitmentHash: didState.nextRecoveryCommitmentHash,
      // New values below.
      document: resultingDocument,
      nextUpdateCommitmentHash: operation.delta!.updateCommitment,
      lastOperationTransactionNumber: anchoredOperationModel.transactionNumber
    };

    return newDidState;
  }

  /**
   * @returns new DID state if operation is applied successfully; the given DID state otherwise.
   */
  private async applyRecoverOperation (
    anchoredOperationModel: AnchoredOperationModel,
    didState: DidState
  ): Promise<DidState> {

    // When delta parsing fails, operation.delta is undefined.
    const operation = await RecoverOperation.parse(anchoredOperationModel.operationBuffer);

    // Verify the recovery key hash.
    const isValidRecoveryKey = Multihash.canonicalizeAndVerifyDoubleHash(operation.signedData.recoveryKey, didState.nextRecoveryCommitmentHash!);
    if (!isValidRecoveryKey) {
      return didState;
    }

    // Verify the signature.
    const signatureIsValid = await operation.signedDataJws.verifySignature(operation.signedData.recoveryKey);
    if (!signatureIsValid) {
      return didState;
    }

    const newDidState: DidState = {
      nextRecoveryCommitmentHash: operation.signedData.recoveryCommitment,
      document: { },
      nextUpdateCommitmentHash: undefined,
      lastOperationTransactionNumber: anchoredOperationModel.transactionNumber
    };

    if (operation.delta === undefined) {
      return newDidState;
    }

    // Verify the delta hash against the expected delta hash.
    const deltaPayload = JsonCanonicalizer.canonicalizeAsBuffer({
      updateCommitment: operation.delta.updateCommitment,
      patches: operation.delta.patches
    });

    const isMatchingDelta = Multihash.verifyEncodedMultihashForContent(deltaPayload, operation.signedData.deltaHash);
    if (!isMatchingDelta) {
      return newDidState;
    };

    // Apply the given patches against an empty object.
    const delta = operation.delta;
    let document = { };

    // update the commitment hash regardless
    newDidState.nextUpdateCommitmentHash = delta.updateCommitment;
    try {
      document = DocumentComposer.applyPatches(document, delta.patches);
      newDidState.document = document;
    } catch (error) {
      const didUniqueSuffix = anchoredOperationModel.didUniqueSuffix;
      const transactionNumber = anchoredOperationModel.transactionNumber;
      Logger.info(
        `Partial update on next commitment hash applied because: ` +
        `Unable to apply delta patches for transaction number ${transactionNumber} for DID ${didUniqueSuffix}: ${SidetreeError.stringify(error)}.`);
    }

    return newDidState;
  }

  /**
   * @returns new DID state if operation is applied successfully; the given DID state otherwise.
   */
  private async applyDeactivateOperation (
    anchoredOperationModel: AnchoredOperationModel,
    didState: DidState
  ): Promise<DidState> {

    const operation = await DeactivateOperation.parse(anchoredOperationModel.operationBuffer);

    // Verify the recovery key hash.
    const isValidRecoveryKey = Multihash.canonicalizeAndVerifyDoubleHash(operation.signedData.recoveryKey, didState.nextRecoveryCommitmentHash!);
    if (!isValidRecoveryKey) {
      return didState;
    }

    // Verify the signature.
    const signatureIsValid = await operation.signedDataJws.verifySignature(operation.signedData.recoveryKey);
    if (!signatureIsValid) {
      return didState;
    }

    // The operation passes all checks.
    const newDidState = {
      document: didState.document,
      // New values below.
      nextRecoveryCommitmentHash: undefined,
      nextUpdateCommitmentHash: undefined,
      lastOperationTransactionNumber: anchoredOperationModel.transactionNumber
    };
    return newDidState;
  }
}

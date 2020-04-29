import AnchoredOperationModel from '../../models/AnchoredOperationModel';
import CreateOperation from './CreateOperation';
import DeactivateOperation from './DeactivateOperation';
import DocumentComposer from './DocumentComposer';
import DidState from '../../models/DidState';
import ErrorCode from './ErrorCode';
import IOperationProcessor from '../../interfaces/IOperationProcessor';
import Multihash from './Multihash';
import OperationType from '../../enums/OperationType';
import RecoverOperation from './RecoverOperation';
import SidetreeError from '../../../common/SidetreeError';
import UpdateOperation from './UpdateOperation';

/**
 * Implementation of OperationProcessor. Uses a OperationStore
 * that might, e.g., use a backend database for persistence.
 * All 'processing' is deferred to resolve time, with process()
 * simply storing the operation in the store.
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
      const lastOperationTransactionNumber = appliedDidState ? appliedDidState.lastOperationTransactionNumber : undefined;

      // If the operation was not applied, log some info in case needed for debugging.
      if (previousOperationTransactionNumber === lastOperationTransactionNumber) {
        const index = anchoredOperationModel.operationIndex;
        const time = anchoredOperationModel.transactionTime;
        const number = anchoredOperationModel.transactionNumber;
        const didUniqueSuffix = anchoredOperationModel.didUniqueSuffix;
        console.debug(`Ignored invalid operation for DID '${didUniqueSuffix}' in transaction '${number}' at time '${time}' at operation index ${index}.`);
      }
    } catch (error) {
      console.log(`Failed logging ${error}.`);
      // If logging fails, just move on.
    }

    return appliedDidState;
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

    const operation = await CreateOperation.parse(anchoredOperationModel.operationBuffer);

    // Ensure actual delta hash matches expected delta hash.
    const isMatchingDelta = Multihash.isValidHash(operation.encodedDelta, operation.suffixData.deltaHash);
    if (!isMatchingDelta) {
      return didState;
    }

    // Apply the given patches against an empty object.
    const delta = operation.delta;
    let document = { };
    try {
      if (delta !== undefined) {
        document = DocumentComposer.applyPatches(document, delta.patches);
      }
    } catch (error) {
      const didUniqueSuffix = anchoredOperationModel.didUniqueSuffix;
      const transactionNumber = anchoredOperationModel.transactionNumber;
      console.debug(`Unable to apply document patch in transaction number ${transactionNumber} for DID ${didUniqueSuffix}: ${SidetreeError.stringify(error)}.`);

      // Return the given DID state if error is encountered applying the patches.
      return didState;
    }

    const newDidState = {
      didUniqueSuffix: operation.didUniqueSuffix,
      document,
      recoveryKey: operation.suffixData.recoveryKey,
      nextRecoveryCommitmentHash: operation.suffixData.recoveryCommitment,
      nextUpdateCommitmentHash: delta ? delta.updateCommitment : undefined,
      lastOperationTransactionNumber: anchoredOperationModel.transactionNumber
    };

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

    // Verify the actual reveal value hash against the expected commitment hash.
    const isValidCommitReveal = Multihash.isValidHash(operation.updateRevealValue, didState.nextUpdateCommitmentHash!);
    if (!isValidCommitReveal) {
      return didState;
    }

    // Verify the delta hash against the expected delta hash.
    const isValidDelta = Multihash.isValidHash(operation.encodedDelta, operation.signedData.delta_hash);
    if (!isValidDelta) {
      return didState;
    }

    let resultingDocument;
    try {
      resultingDocument = await DocumentComposer.applyUpdateOperation(operation, didState.document);
    } catch (error) {
      const didUniqueSuffix = anchoredOperationModel.didUniqueSuffix;
      const transactionNumber = anchoredOperationModel.transactionNumber;
      console.debug(`Unable to apply document patch in transaction number ${transactionNumber} for DID ${didUniqueSuffix}: ${SidetreeError.stringify(error)}.`);

      // Return the given DID state if error is encountered applying the patches.
      return didState;
    }

    const newDidState = {
      recoveryKey: didState.recoveryKey,
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

    const operation = await RecoverOperation.parse(anchoredOperationModel.operationBuffer);

    // Verify the reveal value hash.
    const isValidCommitReveal = Multihash.isValidHash(operation.recoveryRevealValue, didState.nextRecoveryCommitmentHash!);
    if (!isValidCommitReveal) {
      return didState;
    }

    // Verify the signature.
    const signatureIsValid = await operation.signedDataJws.verifySignature(didState.recoveryKey!);
    if (!signatureIsValid) {
      return didState;
    }

    // Verify the actual delta hash against the expected delta hash.
    const isMatchingDelta = Multihash.isValidHash(operation.encodedDelta, operation.signedData.delta_hash);
    if (!isMatchingDelta) {
      return didState;
    }

    // Apply the given patches against an empty object.
    const delta = operation.delta;
    let document = { };
    try {
      if (delta !== undefined) {
        document = DocumentComposer.applyPatches(document, delta.patches);
      }
    } catch (error) {
      const didUniqueSuffix = anchoredOperationModel.didUniqueSuffix;
      const transactionNumber = anchoredOperationModel.transactionNumber;
      console.debug(`Unable to apply document patch in transaction number ${transactionNumber} for DID ${didUniqueSuffix}: ${SidetreeError.stringify(error)}.`);

      // Return the given DID state if error is encountered applying the patches.
      return didState;
    }

    const newDidState = {
      didUniqueSuffix: operation.didUniqueSuffix,
      document,
      recoveryKey: operation.signedData.recovery_key,
      nextRecoveryCommitmentHash: operation.signedData.recovery_commitment,
      nextUpdateCommitmentHash: delta ? delta.updateCommitment : undefined,
      lastOperationTransactionNumber: anchoredOperationModel.transactionNumber
    };

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

    // Verify the reveal value hash.
    const isValidCommitmentReveal = Multihash.isValidHash(operation.recoveryRevealValue, didState.nextRecoveryCommitmentHash!);
    if (!isValidCommitmentReveal) {
      return didState;
    }

    // Verify the signature.
    const signatureIsValid = await operation.signedDataJws.verifySignature(didState.recoveryKey!);
    if (!signatureIsValid) {
      return didState;
    }

    // The operation passes all checks.
    const newDidState = {
      document: didState.document,
      // New values below.
      recoveryKey: undefined,
      nextRecoveryCommitmentHash: undefined,
      nextUpdateCommitmentHash: undefined,
      lastOperationTransactionNumber: anchoredOperationModel.transactionNumber
    };
    return newDidState;
  }
}

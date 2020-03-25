import AnchoredOperationModel from '../../models/AnchoredOperationModel';
import CreateOperation from './CreateOperation';
import DocumentComposer from './DocumentComposer';
import DocumentState from '../../models/DocumentState';
import ErrorCode from './ErrorCode';
import IOperationProcessor from '../../interfaces/IOperationProcessor';
import Multihash from './Multihash';
import OperationType from '../../enums/OperationType';
import RecoverOperation from './RecoverOperation';
import RevokeOperation from './RevokeOperation';
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
    documentState: DocumentState | undefined
  ): Promise<DocumentState | undefined> {
    // If document state is undefined, then the operation given must be a create operation, otherwise the operation cannot be applied.
    if (documentState === undefined && anchoredOperationModel.type !== OperationType.Create) {
      return undefined;
    }

    const previousOperationTransactionNumber = documentState ? documentState.lastOperationTransactionNumber : undefined;

    let appliedDocumentState: DocumentState | undefined;
    if (anchoredOperationModel.type === OperationType.Create) {
      appliedDocumentState = await this.applyCreateOperation(anchoredOperationModel, documentState);
    } else if (anchoredOperationModel.type === OperationType.Update) {
      appliedDocumentState = await this.applyUpdateOperation(anchoredOperationModel, documentState!);
    } else if (anchoredOperationModel.type === OperationType.Recover) {
      appliedDocumentState = await this.applyRecoverOperation(anchoredOperationModel, documentState!);
    } else if (anchoredOperationModel.type === OperationType.Revoke) {
      appliedDocumentState = await this.applyRevokeOperation(anchoredOperationModel, documentState!);
    } else {
      throw new SidetreeError(ErrorCode.OperationProcessorUnknownOperationType);
    }

    try {
      const lastOperationTransactionNumber = appliedDocumentState ? appliedDocumentState.lastOperationTransactionNumber : undefined;

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

    return appliedDocumentState;
  }

  /**
   * @returns new document state if operation is applied successfully; the given document state otherwise.
   */
  private async applyCreateOperation (
    anchoredOperationModel: AnchoredOperationModel,
    documentState: DocumentState | undefined
  ): Promise<DocumentState | undefined> {
    // If document state is already created by a previous create operation, then we cannot apply a create operation again.
    if (documentState !== undefined) {
      return documentState;
    }

    const operation = await CreateOperation.parse(anchoredOperationModel.operationBuffer);

    // Ensure actual operation data hash matches expected operation data hash.
    const isMatchingOperationData = Multihash.isValidHash(operation.encodedOperationData, operation.suffixData.operationDataHash);
    if (!isMatchingOperationData) {
      return documentState;
    }

    // Apply the given patches against an empty object.
    const operationData = operation.operationData;
    let document = { };
    try {
      if (operationData !== undefined) {
        document = DocumentComposer.applyPatches(document, operationData.patches);
      }
    } catch (error) {
      const didUniqueSuffix = anchoredOperationModel.didUniqueSuffix;
      const transactionNumber = anchoredOperationModel.transactionNumber;
      console.debug(`Unable to apply document patch in transaction number ${transactionNumber} for DID ${didUniqueSuffix}: ${SidetreeError.stringify(error)}.`);

      // Return the given document state if error is encountered applying the update.
      return documentState;
    }

    const newDocumentState = {
      didUniqueSuffix: operation.didUniqueSuffix,
      document,
      recoveryKey: operation.suffixData.recoveryKey,
      nextRecoveryOtpHash: operation.suffixData.nextRecoveryOtpHash,
      nextUpdateOtpHash: operationData ? operationData.nextUpdateOtpHash : undefined,
      lastOperationTransactionNumber: anchoredOperationModel.transactionNumber
    };

    return newDocumentState;
  }

  /**
   * @returns new document state if operation is applied successfully; the given document state otherwise.
   */
  private async applyUpdateOperation (
    anchoredOperationModel: AnchoredOperationModel,
    documentState: DocumentState
  ): Promise<DocumentState> {

    const operation = await UpdateOperation.parse(anchoredOperationModel.operationBuffer);

    // Verify the actual OTP hash against the expected OTP hash.
    const isValidOtp = Multihash.isValidHash(operation.updateOtp, documentState.nextUpdateOtpHash!);
    if (!isValidOtp) {
      return documentState;
    }

    // Verify the operation data hash against the expected operation data hash.
    const isValidOperationData = Multihash.isValidHash(operation.encodedOperationData, operation.signedOperationDataHash.payload);
    if (!isValidOperationData) {
      return documentState;
    }

    let resultingDocument;
    try {
      resultingDocument = await DocumentComposer.applyUpdateOperation(operation, documentState.document);
    } catch (error) {
      const didUniqueSuffix = anchoredOperationModel.didUniqueSuffix;
      const transactionNumber = anchoredOperationModel.transactionNumber;
      console.debug(`Unable to apply document patch in transaction number ${transactionNumber} for DID ${didUniqueSuffix}: ${SidetreeError.stringify(error)}.`);

      // Return the given document state if error is encountered applying the update.
      return documentState;
    }

    const newDocumentState = {
      didUniqueSuffix: documentState.didUniqueSuffix,
      recoveryKey: documentState.recoveryKey,
      nextRecoveryOtpHash: documentState.nextRecoveryOtpHash,
      // New values below.
      document: resultingDocument,
      nextUpdateOtpHash: operation.operationData!.nextUpdateOtpHash,
      lastOperationTransactionNumber: anchoredOperationModel.transactionNumber
    };

    return newDocumentState;
  }

  /**
   * @returns new document state if operation is applied successfully; the given document state otherwise.
   */
  private async applyRecoverOperation (
    anchoredOperationModel: AnchoredOperationModel,
    documentState: DocumentState
  ): Promise<DocumentState> {

    const operation = await RecoverOperation.parse(anchoredOperationModel.operationBuffer);

    // Verify the actual OTP hash against the expected OTP hash.
    const isValidOtp = Multihash.isValidHash(operation.recoveryOtp, documentState.nextRecoveryOtpHash!);
    if (!isValidOtp) {
      return documentState;
    }

    // Verify the signature.
    const signatureIsValid = await operation.signedOperationDataJws.verifySignature(documentState.recoveryKey!);
    if (!signatureIsValid) {
      return documentState;
    }

    // Verify the actual operation data hash against the expected operation data hash.
    const isMatchingOperationData = Multihash.isValidHash(operation.encodedOperationData, operation.signedOperationData.operationDataHash);
    if (!isMatchingOperationData) {
      return documentState;
    }

    // Apply the given patches against an empty object.
    const operationData = operation.operationData;
    let document = { };
    try {
      if (operationData !== undefined) {
        document = DocumentComposer.applyPatches(document, operationData.patches);
      }
    } catch (error) {
      const didUniqueSuffix = anchoredOperationModel.didUniqueSuffix;
      const transactionNumber = anchoredOperationModel.transactionNumber;
      console.debug(`Unable to apply document patch in transaction number ${transactionNumber} for DID ${didUniqueSuffix}: ${SidetreeError.stringify(error)}.`);

      // Return the given document state if error is encountered applying the update.
      return documentState;
    }

    const newDocumentState = {
      didUniqueSuffix: operation.didUniqueSuffix,
      document,
      recoveryKey: operation.signedOperationData.recoveryKey,
      nextRecoveryOtpHash: operation.signedOperationData.nextRecoveryOtpHash,
      nextUpdateOtpHash: operationData ? operationData.nextUpdateOtpHash : undefined,
      lastOperationTransactionNumber: anchoredOperationModel.transactionNumber
    };

    return newDocumentState;
  }

  /**
   * @returns new document state if operation is applied successfully; the given document state otherwise.
   */
  private async applyRevokeOperation (
    anchoredOperationModel: AnchoredOperationModel,
    documentState: DocumentState
  ): Promise<DocumentState> {

    const operation = await RevokeOperation.parse(anchoredOperationModel.operationBuffer);

    // Verify the actual OTP hash against the expected OTP hash.
    const isValidOtp = Multihash.isValidHash(operation.recoveryOtp, documentState.nextRecoveryOtpHash!);
    if (!isValidOtp) {
      return documentState;
    }

    // Verify the signature.
    const signatureIsValid = await operation.signedOperationDataJws.verifySignature(documentState.recoveryKey!);
    if (!signatureIsValid) {
      return documentState;
    }

    // The operation passes all checks.
    const newDocumentState = {
      didUniqueSuffix: documentState.didUniqueSuffix,
      document: documentState.document,
      // New values below.
      recoveryKey: undefined,
      nextRecoveryOtpHash: undefined,
      nextUpdateOtpHash: undefined,
      lastOperationTransactionNumber: anchoredOperationModel.transactionNumber
    };
    return newDocumentState;
  }
}

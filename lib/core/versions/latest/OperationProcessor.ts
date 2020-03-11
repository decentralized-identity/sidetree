import CreateOperation from './CreateOperation';
import DocumentComposer from './DocumentComposer';
import DocumentState from '../../models/DocumentState';
import ErrorCode from './ErrorCode';
import IOperationProcessor from '../../interfaces/IOperationProcessor';
import Multihash from './Multihash';
import NamedAnchoredOperationModel from '../../models/NamedAnchoredOperationModel';
import OperationType from '../../enums/OperationType';
import RecoverOperation from './RecoverOperation';
import RevokeOperation from './RevokeOperation';
import SidetreeError from '../../SidetreeError';
import UpdateOperation from './UpdateOperation';

/**
 * Implementation of OperationProcessor. Uses a OperationStore
 * that might, e.g., use a backend database for persistence.
 * All 'processing' is deferred to resolve time, with process()
 * simply storing the operation in the store.
 */
export default class OperationProcessor implements IOperationProcessor {

  public async apply (
    namedAnchoredOperationModel: NamedAnchoredOperationModel,
    documentState: DocumentState | undefined
  ): Promise<DocumentState | undefined> {
    // If document state is undefined, then the operation given must be a create operation, otherwise the operation cannot be applied.
    if (documentState === undefined && namedAnchoredOperationModel.type !== OperationType.Create) {
      return undefined;
    }

    const previousOperationTransactionNumber = documentState ? documentState.lastOperationTransactionNumber : undefined;

    let appliedDocumentState: DocumentState | undefined;
    if (namedAnchoredOperationModel.type === OperationType.Create) {
      appliedDocumentState = await this.applyCreateOperation(namedAnchoredOperationModel, documentState);
    } else if (namedAnchoredOperationModel.type === OperationType.Update) {
      appliedDocumentState = await this.applyUpdateOperation(namedAnchoredOperationModel, documentState!);
    } else if (namedAnchoredOperationModel.type === OperationType.Recover) {
      appliedDocumentState = await this.applyRecoverOperation(namedAnchoredOperationModel, documentState!);
    } else if (namedAnchoredOperationModel.type === OperationType.Revoke) {
      appliedDocumentState = await this.applyRevokeOperation(namedAnchoredOperationModel, documentState!);
    } else {
      throw new SidetreeError(ErrorCode.OperationProcessorUnknownOperationType);
    }

    try {
      const lastOperationTransactionNumber = appliedDocumentState ? appliedDocumentState.lastOperationTransactionNumber : undefined;

      // If the operation was not applied, log some info in case needed for debugging.
      if (previousOperationTransactionNumber === lastOperationTransactionNumber) {
        const index = namedAnchoredOperationModel.operationIndex;
        const time = namedAnchoredOperationModel.transactionTime;
        const number = namedAnchoredOperationModel.transactionNumber;
        const didUniqueSuffix = namedAnchoredOperationModel.didUniqueSuffix;
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
    namedAnchoredOperationModel: NamedAnchoredOperationModel,
    documentState: DocumentState | undefined
  ): Promise<DocumentState | undefined> {
    // If document state is already created by a previous create operation, then we cannot apply a create operation again.
    if (documentState !== undefined) {
      return documentState;
    }

    const operation = await CreateOperation.parse(namedAnchoredOperationModel.operationBuffer);

    // Ensure actual operation data hash matches expected operation data hash.
    const isValidOperationData = Multihash.isValidHash(operation.encodedOperationData, operation.suffixData.operationDataHash);
    if (!isValidOperationData) {
      return documentState;
    }

    const newDocumentState = {
      didUniqueSuffix: operation.didUniqueSuffix,
      document: operation.operationData.document,
      recoveryKey: operation.suffixData.recoveryKey,
      nextRecoveryOtpHash: operation.suffixData.nextRecoveryOtpHash,
      nextUpdateOtpHash: operation.operationData.nextUpdateOtpHash,
      lastOperationTransactionNumber: namedAnchoredOperationModel.transactionNumber
    };

    return newDocumentState;
  }

  /**
   * @returns new document state if operation is applied successfully; the given document state otherwise.
   */
  private async applyUpdateOperation (
    namedAnchoredOperationModel: NamedAnchoredOperationModel,
    documentState: DocumentState
  ): Promise<DocumentState> {

    const operation = await UpdateOperation.parse(namedAnchoredOperationModel.operationBuffer);

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
    } catch {
      // Return the given document state if error is encountered applying the update.
      return documentState;
    }

    const newDocumentState = {
      didUniqueSuffix: documentState.didUniqueSuffix,
      recoveryKey: documentState.recoveryKey,
      nextRecoveryOtpHash: documentState.nextRecoveryOtpHash,
      // New values below.
      document: resultingDocument,
      nextUpdateOtpHash: operation.operationData.nextUpdateOtpHash,
      lastOperationTransactionNumber: namedAnchoredOperationModel.transactionNumber
    };

    return newDocumentState;
  }

  /**
   * @returns new document state if operation is applied successfully; the given document state otherwise.
   */
  private async applyRecoverOperation (
    namedAnchoredOperationModel: NamedAnchoredOperationModel,
    documentState: DocumentState
  ): Promise<DocumentState> {

    const operation = await RecoverOperation.parse(namedAnchoredOperationModel.operationBuffer);

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
    const isValidOperationData = Multihash.isValidHash(operation.encodedOperationData, operation.signedOperationData.operationDataHash);
    if (!isValidOperationData) {
      return documentState;
    }

    const newDocumentState = {
      didUniqueSuffix: operation.didUniqueSuffix,
      document: operation.operationData.document,
      recoveryKey: operation.signedOperationData.recoveryKey,
      nextRecoveryOtpHash: operation.signedOperationData.nextRecoveryOtpHash,
      nextUpdateOtpHash: operation.operationData.nextUpdateOtpHash,
      lastOperationTransactionNumber: namedAnchoredOperationModel.transactionNumber
    };

    return newDocumentState;
  }

  /**
   * @returns new document state if operation is applied successfully; the given document state otherwise.
   */
  private async applyRevokeOperation (
    namedAnchoredOperationModel: NamedAnchoredOperationModel,
    documentState: DocumentState
  ): Promise<DocumentState> {

    const operation = await RevokeOperation.parse(namedAnchoredOperationModel.operationBuffer);

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
      lastOperationTransactionNumber: namedAnchoredOperationModel.transactionNumber
    };
    return newDocumentState;
  }
}

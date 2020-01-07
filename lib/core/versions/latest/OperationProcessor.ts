import AnchoredOperation from './AnchoredOperation';
import AnchoredOperationModel from '../../models/AnchoredOperationModel';
import DidResolutionModel from '../../models/DidResolutionModel';
import Document from './Document';
import DocumentModel from './models/DocumentModel';
import IOperationProcessor, { ApplyResult } from '../../interfaces/IOperationProcessor';
import KeyUsage from './KeyUsage';
import Multihash from './Multihash';
import OperationType from '../../enums/OperationType';

/**
 * Implementation of OperationProcessor. Uses a OperationStore
 * that might, e.g., use a backend database for persistence.
 * All 'processing' is deferred to resolve time, with process()
 * simply storing the operation in the store.
 */
export default class OperationProcessor implements IOperationProcessor {

  public constructor (private didMethodName: string) { }

  public async apply (
    anchoredOperationModel: AnchoredOperationModel,
    didResolutionModel: DidResolutionModel
  ): Promise<ApplyResult> {
    let validOperation = false;

    try {
      const operation = AnchoredOperation.createAnchoredOperation(anchoredOperationModel);

      if (operation.type === OperationType.Create) {
        validOperation = await this.applyCreateOperation(operation, didResolutionModel);
      } else if (operation.type === OperationType.Update) {
        validOperation = await this.applyUpdateOperation(operation, didResolutionModel);
      } else if (operation.type === OperationType.Recover) {
        validOperation = await this.applyRecoverOperation(operation, didResolutionModel);
      } else {
        // Revoke operation.
        validOperation = await this.applyRevokeOperation(operation, didResolutionModel);
      }

    } catch (error) {
      console.log(`Invalid operation ${error}.`);
    }

    // If the operation was not applied - it means the operation is not valid, we log some info in case needed for debugging.
    try {
      if (!validOperation) {
        const index = anchoredOperationModel.operationIndex;
        const time = anchoredOperationModel.transactionTime;
        const number = anchoredOperationModel.transactionNumber;
        const did = didResolutionModel ? didResolutionModel.didDocument.id : undefined;
        console.info(`Ignored invalid operation for DID '${did}' in transaction '${number}' at time '${time}' at operation index ${index}.`);
      }
    } catch (error) {
      console.log(`Failed logging ${error}.`);
      // If logging fails, just move on.
    }

    return { validOperation };
  }

  /**
   * @returns `true` if operation was successfully applied, `false` otherwise.
   */
  private async applyCreateOperation (
    operation: AnchoredOperation,
    didResolutionModel: DidResolutionModel
  ): Promise<boolean> {
    // If we have seen a previous create operation.
    if (didResolutionModel.didDocument) {
      return false;
    }

    const did = this.didMethodName + operation.didUniqueSuffix;
    const didDocument = operation.didDocument!;
    Document.addDidToDocument(didDocument, did);

    const signingKey = Document.getPublicKey(didDocument, operation.signingKeyId);
    if (!signingKey) {
      return false;
    }

    if (!(await operation.verifySignature(signingKey))) {
      return false;
    }

    didResolutionModel.didDocument = didDocument;
    didResolutionModel.metadata = {
      lastOperationTransactionNumber: operation.transactionNumber,
      nextRecoveryOtpHash: operation.nextRecoveryOtpHash!,
      nextUpdateOtpHash: operation.nextUpdateOtpHash!
    };

    return true;
  }

  /**
   * @returns `true` if operation was successfully applied, `false` otherwise.
   */
  private async applyUpdateOperation (
    operation: AnchoredOperation,
    didResolutionModel: DidResolutionModel
  ): Promise<boolean> {

    const didDocument = didResolutionModel.didDocument;

    // If we have not seen a valid create operation yet.
    if (didDocument === undefined) {
      return false;
    }

    // Verify the actual OTP hash against the expected OTP hash.
    const isValidUpdateOtp = Multihash.isValidHash(operation.updateOtp!, didResolutionModel.metadata!.nextUpdateOtpHash);
    if (!isValidUpdateOtp) {
      return false;
    }

    // The current did document must contain the public key mentioned in the operation ...
    const publicKey = Document.getPublicKey(didDocument, operation.signingKeyId);
    if (!publicKey) {
      return false;
    }

    // ... and the signature must pass verification.
    if (!(await operation.verifySignature(publicKey))) {
      return false;
    }

    // The operation passes all checks, apply the patches.
    AnchoredOperation.applyPatchesToDidDocument(didDocument, operation.patches!);

    didResolutionModel.metadata!.lastOperationTransactionNumber = operation.transactionNumber;
    didResolutionModel.metadata!.nextUpdateOtpHash = operation.nextUpdateOtpHash!;

    return true;
  }

  /**
   * @returns `true` if operation was successfully applied, `false` otherwise.
   */
  private async applyRecoverOperation (
    operation: AnchoredOperation,
    didResolutionModel: DidResolutionModel
  ): Promise<boolean> {

    const didDocument = didResolutionModel.didDocument as (DocumentModel | undefined);

    // Recovery can only be applied on an existing DID.
    if (!didDocument) {
      return false;
    }

    // Verify the actual OTP hash against the expected OTP hash.
    const isValidOtp = Multihash.isValidHash(operation.recoveryOtp!, didResolutionModel.metadata!.nextUpdateOtpHash);
    if (!isValidOtp) {
      return false;
    }

    // The current did document must contain the public key mentioned in the operation ...
    const publicKey = Document.getPublicKey(didDocument, operation.signingKeyId);
    if (!publicKey) {
      return false;
    }

    // The key must be a recovery key.
    if (publicKey.usage !== KeyUsage.recovery) {
      return false;
    }

    // ... and the signature must pass verification.
    if (!(await operation.verifySignature(publicKey))) {
      return false;
    }

    const newDidDocument = operation.didDocument!;
    newDidDocument.id = this.didMethodName + operation.didUniqueSuffix;
    didResolutionModel.didDocument = newDidDocument;
    return true;
  }

  /**
   * @returns `true` if operation was successfully applied, `false` otherwise.
   */
  private async applyRevokeOperation (
    operation: AnchoredOperation,
    didResolutionModel: DidResolutionModel
  ): Promise<boolean> {
    // NOTE: Use only for read interally to this method.
    const didDocument = didResolutionModel.didDocument as (DocumentModel | undefined);

    // Recovation can only be applied on an existing DID.
    if (!didDocument) {
      return false;
    }

    // Verify the actual OTP hash against the expected OTP hash.
    const isValidOtp = Multihash.isValidHash(operation.recoveryOtp!, didResolutionModel.metadata!.nextUpdateOtpHash);
    if (!isValidOtp) {
      return false;
    }

    // The current did document must contain the public key mentioned in the operation ...
    const publicKey = Document.getPublicKey(didDocument, operation.signingKeyId);
    if (!publicKey) {
      return false;
    }

    // ... and the signature must pass verification.
    if (!(await operation.verifySignature(publicKey))) {
      return false;
    }

    // The operation passes all checks.
    didResolutionModel.didDocument = undefined;
    return true;
  }
}

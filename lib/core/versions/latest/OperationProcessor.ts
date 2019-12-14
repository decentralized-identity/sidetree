import AnchoredOperation from './AnchoredOperation';
import AnchoredOperationModel from '../../models/AnchoredOperationModel';
import Document from './Document';
import DocumentModel from './models/DocumentModel';
import IOperationProcessor, { ApplyResult } from '../../interfaces/IOperationProcessor';
import KeyUsage from './KeyUsage';
import OperationType from '../../enums/OperationType';
import ProtocolParameters from './ProtocolParameters';

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
    didDocumentReference: { didDocument: DocumentModel | undefined }
  ): Promise<ApplyResult> {
    let operationHash = undefined;

    try {
      const operation = AnchoredOperation.createAnchoredOperation(anchoredOperationModel);
      operationHash = operation.operationHash;

      let validOperation = false;
      if (operation.type === OperationType.Create) {
        validOperation = await this.applyCreateOperation(operation, didDocumentReference);
      } else if (operation.type === OperationType.Update) {
        validOperation = await this.applyUpdateOperation(operation, didDocumentReference);
      } else if (operation.type === OperationType.Recover) {
        validOperation = await this.applyRecoverOperation(operation, didDocumentReference);
      } else {
        // Revoke operation.
        validOperation = await this.applyRevokeOperation(operation, didDocumentReference);
      }

      return { validOperation, operationHash };
    } catch (error) {
      console.log(`Invalid operation ${error}.`);
      return { validOperation: false, operationHash };
    }
  }

  /**
   * @returns `true` if operation was successfully applied, `false` otherwise.
   */
  private async applyCreateOperation (
    operation: AnchoredOperation,
    didDocumentReference: { didDocument: object | undefined }
  ): Promise<boolean> {
    // If we have seen a previous create operation.
    if (didDocumentReference.didDocument) {
      return false;
    }

    const originalDidDocument = await Document.from(operation.encodedPayload, this.didMethodName, ProtocolParameters.hashAlgorithmInMultihashCode);
    const signingKey = Document.getPublicKey(originalDidDocument!, operation.signingKeyId);

    if (!signingKey) {
      return false;
    }

    if (!(await operation.verifySignature(signingKey))) {
      return false;
    }

    didDocumentReference.didDocument = originalDidDocument;
    return true;
  }

  /**
   * @returns `true` if operation was successfully applied, `false` otherwise.
   */
  private async applyUpdateOperation (
    operation: AnchoredOperation,
    didDocumentReference: { didDocument: DocumentModel | undefined }
  ): Promise<boolean> {

    const didDocument = didDocumentReference.didDocument;

    // If we have not seen a valid create operation yet.
    if (didDocument === undefined) {
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
    AnchoredOperation.applyPatchesToDidDocument(didDocument, operation.patches!);
    return true;
  }

  /**
   * @returns `true` if operation was successfully applied, `false` otherwise.
   */
  private async applyRecoverOperation (
    operation: AnchoredOperation,
    didDocumentReference: { didDocument: object | undefined }
  ): Promise<boolean> {

    const didDocument = didDocumentReference.didDocument as (DocumentModel | undefined);

    // Recovery can only be applied on an existing DID.
    if (!didDocument) {
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
    didDocumentReference.didDocument = newDidDocument;
    return true;
  }

  /**
   * @returns `true` if operation was successfully applied, `false` otherwise.
   */
  private async applyRevokeOperation (
    operation: AnchoredOperation,
    didDocumentReference: { didDocument: object | undefined }
  ): Promise<boolean> {
    // NOTE: Use only for read interally to this method.
    const didDocument = didDocumentReference.didDocument as (DocumentModel | undefined);

    // Recovation can only be applied on an existing DID.
    if (!didDocument) {
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
    didDocumentReference.didDocument = undefined;
    return true;
  }
}

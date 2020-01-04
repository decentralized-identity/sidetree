import AnchoredOperation from './AnchoredOperation';
import AnchoredOperationModel from '../../models/AnchoredOperationModel';
import Document from './Document';
import DocumentModel from './models/DocumentModel';
import IOperationProcessor, { ApplyResult } from '../../interfaces/IOperationProcessor';
import ProtocolParameters from './ProtocolParameters';
import { OperationType } from './Operation';

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
    didDocumentReference: { didDocument: object | undefined }
  ): Promise<ApplyResult> {
    try {
      // NOTE: only used for read interally.
      const didDocument = didDocumentReference.didDocument as (DocumentModel | undefined);
      const operation = AnchoredOperation.createAnchoredOperation(anchoredOperationModel);

      if (operation.type === OperationType.Create) {

        // If we have seen a previous create operation.
        if (didDocumentReference.didDocument) {
          return { validOperation: false };
        }

        const originalDidDocument = Document.from(operation.encodedPayload, this.didMethodName, ProtocolParameters.hashAlgorithmInMultihashCode)!;

        const signingKey = Document.getPublicKey(originalDidDocument, operation.signingKeyId);

        if (!signingKey) {
          return { validOperation: false };
        }

        if (!(await operation.verifySignature(signingKey))) {
          return { validOperation: false };
        }

        didDocumentReference.didDocument = originalDidDocument;
        return { validOperation: true };
      } else if (operation.type === OperationType.Delete) {
        // Delete can be applied only on valid did with a current document
        if (!didDocument) {
          return { validOperation: false };
        }

        // The current did document should contain the public key mentioned in the operation ...
        const publicKey = Document.getPublicKey(didDocument, operation.signingKeyId);
        if (!publicKey) {
          return { validOperation: false };
        }

        // ... and the signature should verify
        if (!(await operation.verifySignature(publicKey))) {
          return { validOperation: false };
        }

        // If the delete is valid
        didDocumentReference.didDocument = undefined;
        return { validOperation: true };
      } else {
        // Update operation

        // If we have not seen a valid create operation yet.
        if (didDocument === undefined) {
          return { validOperation: false };
        }

        // The current did document should contain the public key mentioned in the operation ...
        const publicKey = Document.getPublicKey(didDocument, operation.signingKeyId);
        if (!publicKey) {
          return { validOperation: false };
        }

        // ... and the signature should verify
        if (!(await operation.verifySignature(publicKey))) {
          return { validOperation: false };
        }

        AnchoredOperation.applyPatchesToDidDocument(didDocument, operation.patches!);
        return { validOperation: true };
      }
    } catch (error) {
      console.log(`Invalid operation ${error}.`);
      return { validOperation: false };
    }
  }
}

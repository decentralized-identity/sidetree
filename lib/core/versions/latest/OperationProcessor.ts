import AnchoredOperation from './AnchoredOperation';
import AnchoredOperationModel from '../../models/AnchoredOperationModel';
import Document from './Document';
import DocumentModel from './models/DocumentModel';
import IOperationProcessor, { PatchResult } from '../../interfaces/IOperationProcessor';
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

  public async patch (
    anchoredOperationModel: AnchoredOperationModel,
    previousOperationHash: string | undefined,
    didDocumentReference: { didDocument: object | undefined }
  ): Promise<PatchResult> {
    let operationHash = undefined;

    try {
      // NOTE: only used for read interally.
      const didDocument = didDocumentReference.didDocument as (DocumentModel | undefined);

      const operation = AnchoredOperation.createAnchoredOperation(anchoredOperationModel);
      operationHash = operation.operationHash;

      if (operation.type === OperationType.Create) {

        // If either of these is defined, then we have seen a previous create operation.
        if (previousOperationHash !== undefined || didDocumentReference.didDocument) {
          return { validOperation: false, operationHash };
        }

        const originalDidDocument = Document.from(operation.encodedPayload, this.didMethodName, ProtocolParameters.hashAlgorithmInMultihashCode)!;

        const signingKey = Document.getPublicKey(originalDidDocument, operation.signingKeyId);

        if (!signingKey) {
          return { validOperation: false, operationHash };
        }

        if (!(await operation.verifySignature(signingKey))) {
          return { validOperation: false, operationHash };
        }

        didDocumentReference.didDocument = originalDidDocument;
        return { validOperation: true, operationHash };
      } else if (operation.type === OperationType.Delete) {
        // Delete can be applied only on valid did with a current document
        if (!didDocument) {
          return { validOperation: false, operationHash };
        }

        // The current did document should contain the public key mentioned in the operation ...
        const publicKey = Document.getPublicKey(didDocument, operation.signingKeyId);
        if (!publicKey) {
          return { validOperation: false, operationHash };
        }

        // ... and the signature should verify
        if (!(await operation.verifySignature(publicKey))) {
          return { validOperation: false, operationHash };
        }

        // If the delete is valid
        didDocumentReference.didDocument = undefined;
        return { validOperation: true, operationHash };
      } else {
        // Update operation

        // Every operation other than a create has a previous operation and a valid
        // current DID document.
        if (previousOperationHash === undefined || didDocument === undefined) {
          return { validOperation: false, operationHash };
        }

        // Any non-create needs a previous operation hash that should match the hash of the latest valid operation (previousOperation)
        if (operation.previousOperationHash !== previousOperationHash) {
          return { validOperation: false, operationHash };
        }

        // The current did document should contain the public key mentioned in the operation ...
        const publicKey = Document.getPublicKey(didDocument, operation.signingKeyId);
        if (!publicKey) {
          return { validOperation: false, operationHash };
        }

        // ... and the signature should verify
        if (!(await operation.verifySignature(publicKey))) {
          return { validOperation: false, operationHash };
        }

        AnchoredOperation.applyPatchesToDidDocument(didDocument, operation.patches!);

        // Update the document with the actual id .. for example, the patches may add some fields that may not
        // have the 'id' fields set.
        Document.updatePlaceholdersInDocumentWithDid(didDocument, didDocument.id);

        return { validOperation: true, operationHash };
      }
    } catch (error) {
      console.log(`Invalid operation ${error}.`);
      return { validOperation: false, operationHash };
    }
  }
}

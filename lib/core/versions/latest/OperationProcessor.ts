import Document, { IDocument } from '../../Document';
import IOperationProcessor from '../../interfaces/IOperationProcessor';
import ProtocolParameters from './ProtocolParameters';
import { Operation, OperationType } from '../../Operation';

/**
 * Implementation of OperationProcessor. Uses a OperationStore
 * that might, e.g., use a backend database for persistence.
 * All 'processing' is deferred to resolve time, with process()
 * simply storing the operation in the store.
 */
export default class OperationProcessor implements IOperationProcessor {

  public constructor (private didMethodName: string) { }

  public async apply (operation: Operation, previousOperation: Operation | undefined, didDocumentReference: { didDocument: IDocument | undefined }):
    Promise<boolean> {
    // NOTE: only used for read interally.
    const didDocument = didDocumentReference.didDocument;

    if (operation.type === OperationType.Create) {

      // If either of these is defined, then we have seen a previous create operation.
      if (previousOperation || didDocumentReference.didDocument) {
        return false;
      }

      const originalDidDocument = Document.from(operation.encodedPayload, this.didMethodName, ProtocolParameters.hashAlgorithmInMultihashCode)!;

      const signingKey = Document.getPublicKey(originalDidDocument, operation.signingKeyId);

      if (!signingKey) {
        return false;
      }

      if (!(await operation.verifySignature(signingKey))) {
        return false;
      }

      didDocumentReference.didDocument = originalDidDocument;
      return true;
    } else if (operation.type === OperationType.Delete) {
      // Delete can be applied only on valid did with a current document
      if (!didDocument) {
        return false;
      }

      // The current did document should contain the public key mentioned in the operation ...
      const publicKey = Document.getPublicKey(didDocument, operation.signingKeyId);
      if (!publicKey) {
        return false;
      }

      // ... and the signature should verify
      if (!(await operation.verifySignature(publicKey))) {
        return false;
      }

      // If the delete is valid
      didDocumentReference.didDocument = undefined;
      return true;
    } else {
      // Update operation

      // Every operation other than a create has a previous operation and a valid
      // current DID document.
      if (!previousOperation || !didDocument) {
        return false;
      }

      // Any non-create needs a previous operation hash that should match the hash of the latest valid operation (previousOperation)
      if (operation.previousOperationHash !== previousOperation.getOperationHash()) {
        return false;
      }

      // The current did document should contain the public key mentioned in the operation ...
      const publicKey = Document.getPublicKey(didDocument, operation.signingKeyId);
      if (!publicKey) {
        return false;
      }

      // ... and the signature should verify
      if (!(await operation.verifySignature(publicKey))) {
        return false;
      }

      Operation.applyPatchesToDidDocument(didDocument, operation.patches!);
      return true;
    }
  }
}

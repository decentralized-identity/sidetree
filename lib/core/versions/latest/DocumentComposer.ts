import AnchoredOperation from './AnchoredOperation';
import Document from './Document';
import ErrorCode from './ErrorCode';
import InternalDocumentModel from './models/InternalDocumentModel';
import SidetreeError from '../../SidetreeError';
import UpdateOperation from './UpdateOperation';

/**
 * Composes operations into external-facing document.
 * #266 - DidResolutionModel will be gone by the time #266 is done.
 */
export default class DocumentComposer {
  /**
   * Transforms the given internal document model into a DID Document.
   */
  public transformToExternalDocument (didMethodName: string, internalDocumentModel: InternalDocumentModel): any {
    const did = didMethodName + internalDocumentModel.didUniqueSuffix;
    const didDocument = {
      '@context': 'https://w3id.org/did/v1',
      publicKey: internalDocumentModel.document.publicKey,
      service: internalDocumentModel.document.service,
      recoveryKey: internalDocumentModel.recoveryKey
    };

    Document.addDidToDocument(didDocument, did);

    return didDocument;
  }

  /**
   * Applies the update operation to the given document.
   * @returns The resultant document.
   * @throws SidetreeError if invalid operation is given.
   */
  public async applyUpdateOperation (operation: UpdateOperation, document: any): Promise<any> {
    // The current document must contain the public key mentioned in the operation ...
    const publicKey = Document.getPublicKey(document, operation.signedOperationDataHash.kid);
    if (!publicKey) {
      throw new SidetreeError(ErrorCode.DocumentComposerKeyNotFound);
    }

    // Verfiy the signature.
    if (!(await operation.signedOperationDataHash.verifySignature(publicKey))) {
      throw new SidetreeError(ErrorCode.DocumentComposerInvalidSignature);
    }

    // The operation passes all checks, apply the patches.
    AnchoredOperation.applyPatchesToDidDocument(document, operation.operationData.documentPatch);

    return document;
  }
}

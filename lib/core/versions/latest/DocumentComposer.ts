import UpdateOperation from './UpdateOperation';
import Document from './Document';
import AnchoredOperation from './AnchoredOperation';
import SidetreeError from '../../SidetreeError';
import ErrorCode from './ErrorCode';

/**
 * Composes operations into external-facing document.
 * #266 - DidResolutionModel will be gone by the time #266 is done.
 */
export default class DocumentComposer {
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

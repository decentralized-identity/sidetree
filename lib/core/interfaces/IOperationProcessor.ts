import { IDocument } from '../Document';
import { Operation } from '../Operation';

/**
 * Interface that defines a class that can process operations.
 */
export default interface IOperationProcessor {

  /**
   * Applies an operation on top of the given DID document in place.
   * In the case of an invalid operation, the given DID document will be unchanged.
   * In the case of a (valid) delete operation, the given DID document will be set to `undefined`.
   *
   * NOTE: An object referencing the DID document is used so that
   * `didDocumentReference.didDocument` can be `undefined` initially and be set to an object created.
   * An alternative approach is to include the DID Document as a return value, but that would give the
   * misconception that the given DID Document is unchanged.
   *
   * @param operation The operation to apply against the given DID Document (if any).
   * @param previousOperation The previously operation applied if any. Used for operation validation.
   * @param didDocumentReference The object containing DID document to apply the given operation against.
   * @returns a boolean that indicates if the operation is valid and applied.
   */
  apply (operation: Operation, previousOperation: Operation | undefined, didDocumentReference: { didDocument: IDocument | undefined }): Promise<boolean>;
}

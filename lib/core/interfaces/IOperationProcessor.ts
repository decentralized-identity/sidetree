import AnchoredOperationModel from '../models/AnchoredOperationModel';
import DocumentState from '../models/DocumentState';

/**
 * Interface that defines a class that can process operations.
 */
export default interface IOperationProcessor {

  /**
   * Applies an operation on top of the given document state.
   * In the case of an invalid operation, the resultant document state will remain the same.
   *
   * @param operation The operation to apply against the given DID Document (if any).
   * @param documentState The document state to apply the operation no top of. Needs to be `undefined` if the operation to be applied is a create operation.
   * @returns The resultant `DocumentState`.
   */
  apply (
    operation: AnchoredOperationModel,
    documentState: DocumentState | undefined
  ): Promise<DocumentState | undefined>;
}

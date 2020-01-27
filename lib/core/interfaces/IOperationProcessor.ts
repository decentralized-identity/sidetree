import AnchoredOperationModel from '../models/AnchoredOperationModel';
import DidResolutionModel from '../models/DidResolutionModel';

/**
 * Interface that defines a class that can process operations.
 */
export default interface IOperationProcessor {
  /**
   * Applies an operation on top of the given DID document.
   * In the case of an invalid operation, the given DID document will be unchanged.
   * In the case of a (valid) delete operation, the given DID document will be set to `undefined`.
   *
   * MUST NOT throw error.
   *
   * @param operation The operation to apply against the given DID Document (if any).
   * @param didResolutionModel
   *        The container object that contains the metadata needed for applying the operation and the reference to the DID document to be modified.
   */
  apply(
    operation: AnchoredOperationModel,
    didResolutionModel: DidResolutionModel
  ): Promise<ApplyResult>;
}

/**
 * The result of applying an operation.
 */
export interface ApplyResult {
  validOperation: boolean;
}

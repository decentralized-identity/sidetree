import AnchoredOperationModel from '../models/AnchoredOperationModel';
import DidState from '../models/DidState';

/**
 * Interface that defines a class that can process operations.
 */
export default interface IOperationProcessor {

  /**
   * Applies an operation on top of the given DID state.
   * In the case of an invalid operation, the resultant DID state will remain the same.
   *
   * @param operation The operation to apply against the given DID Document (if any).
   * @param didState The DID state to apply the operation no top of. Needs to be `undefined` if the operation to be applied is a create operation.
   * @returns The resultant `DidState`.
   */
  apply (
    operation: AnchoredOperationModel,
    didState: DidState | undefined
  ): Promise<DidState | undefined>;
}

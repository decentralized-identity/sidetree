import AnchoredOperationModel from '../models/AnchoredOperationModel';
import DidState from '../models/DidState';

/**
 * Interface that defines a class that can process operations.
 */
export default interface IOperationProcessor {

  /**
   * Applies an operation on top of the given DID state.
   *
   * @param operation The operation to apply against the given DID Document (if any).
   * @param didState The DID state to apply the operation no top of. Needs to be `undefined` if the operation to be applied is a create operation.
   * @returns The resultant `DidState`; undefined if operation failed to be applied.
   */
  apply (
    operation: AnchoredOperationModel,
    didState: DidState | undefined
  ): Promise<DidState | undefined>;

  /**
   * Gets the multihash buffer used as the reveal value of a non-create operation.
   */
  getMultihashRevealValue (operation: AnchoredOperationModel): Promise<Buffer>;
}

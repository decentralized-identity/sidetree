import AnchoredOperationModel from './AnchoredOperationModel';
import OperationType from '../enums/OperationType';

/**
 * The minimal contractual properties of an operation across protocol versions, plus the DID unique suffix that this operation belongs to.
 */
export default interface NamedAnchoredOperationModel
  extends AnchoredOperationModel {
  /** The DID unique suffix. */
  didUniqueSuffix: string;
  /** The type of operation. */
  type: OperationType;
}

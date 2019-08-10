import AnchoredOperationModel from './AnchoredOperationModel';

/**
 * The minimal contractual properties of an operation across protocol versions, plus the DID unique suffix that this operation belongs to.
 */
export default interface NamedAnchoredOperationModel extends AnchoredOperationModel {
  /** The DID unique suffix. */
  didUniqueSuffix: string;
}

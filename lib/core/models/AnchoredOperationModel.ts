import OperationType from '../enums/OperationType';

/**
 * The minimal contractual properties of an anchored operation across protocol versions.
 */
export default interface AnchoredOperationModel {
  /** The original request buffer sent by the requester. */
  operationBuffer: Buffer;
  /** The DID unique suffix. */
  didUniqueSuffix: string;
  /** The type of operation. */
  type: OperationType;
  /** The logical blockchain time that this operation was anchored on the blockchain */
  transactionTime: number;
  /** The transaction number of the transaction this operation was batched within. */
  transactionNumber: number;
  /** The index this operation was assigned to in the batch. */
  operationIndex: number;
}

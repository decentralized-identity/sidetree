/**
 * The minimal contractual properties of an operation across protocol versions.
 */
export default interface AnchoredOperationModel {
  /** The logical blockchain time that this opeartion was anchored on the blockchain */
  transactionTime: number;
  /** The transaction number of the transaction this operation was batched within. */
  transactionNumber: number;
  /** The index this operation was assigned to in the batch. */
  operationIndex: number;
  /** The original request buffer sent by the requester. */
  operationBuffer: Buffer;
}

/**
 * Represents an internal (bitcoin layer only) object which uniquely identifies a lock.
 */
export default interface LockIdentifierModel {
  /** The transaction id of the lock */
  transactionId: string;

  /** The redeem script to spend the lock */
  redeemScriptAsHex: string;
}

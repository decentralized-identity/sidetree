/**
 * Represents an object uniquely identifies a lock.
 */
export default interface LockIdentifier {
  /** The transaction id of the lock */
  transactionId: string;

  /** The redeem script to spend the lock */
  redeemScriptAsHex: string;

  /** The address to which the redeem script is paying to */
  walletAddress: Buffer;
}

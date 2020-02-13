/**
 * Encapsulates data about locks created and retrieved by the blockchain service.
 */
export default interface BlockchainLockModel {
  /** Uniquely identifies a lock */
  identifier: string;

  /** The amount that is locked */
  amountLocked: number;

  /** At this transaction time the lock is no longer valid */
  lockEndTransactionTime: number;

  /** The destination where the amount goes upon unlock */
  owner: string;
}

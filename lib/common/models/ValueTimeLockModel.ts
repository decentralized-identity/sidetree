/**
 * Encapsulates data about locks created and retrieved by the blockchain service.
 */
export default interface ValueTimeLockModel {
  /** Uniquely identifies a lock */
  identifier: string;

  /** The amount that is locked */
  amountLocked: number;

  /** At this transaction time the lock is no longer valid */
  unlockTransactionTime: number;

  /** The owner of the lock */
  owner: string;
}

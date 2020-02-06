/**
 * Encapsulates data about locks created by the blockchain service.
 */
export default interface BlockchainLockModel {
  /** Uniquely identifies a lock */
  identifier: string;

  /** The amount that is locked */
  amountLocked: number;

  /** At this transaction time the lock is no longer valid */
  lockEndTransactionTime: number;

  /** The wallet where the amount goes upon unlock */
  linkedWalletAddress: string;
}

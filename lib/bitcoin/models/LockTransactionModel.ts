import LockTransactionType from '../enums/LockTransactionType';

/**
 * Encapsulates the data about a bitcoin 'lock' transaction saved in the database.
 */
export default interface SavedLockTransactionModel {
  transactionId: string;
  redeemScript: string;
  createTimestamp: number;
  type: LockTransactionType;
}

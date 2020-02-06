import SavedLockTransactionType from '../enums/SavedLockTransactionType';

/**
 * Encapsulates the data about a bitcoin 'lock' transaction saved in the database.
 */
export default interface SavedLockTransactionModel {
  transactionId: string;
  redeemScript: string;
  createTimestamp: number;
  type: SavedLockTransactionType;
}

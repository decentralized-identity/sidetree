import SavedLockTransactionType from '../enums/SavedLockTransactionType';

/**
 * Encapsulates the data about a bitcoin 'lock' transaction saved in the database.
 */
export default interface SavedLockTransactionModel {
  createTimestamp: number;
  redeemScriptAsHex: string;
  rawTransaction: string;
  transactionId: string;
  type: SavedLockTransactionType;
}

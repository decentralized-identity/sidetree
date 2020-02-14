import LockTransactionType from '../enums/LockTransactionType';

/**
 * Encapsulates the data about a bitcoin 'lock' transaction saved in the database.
 */
export default interface LockTransactionModel {
  transactionId: string;
  rawTransaction: string;
  redeemScriptAsHex: string;
  desiredLockAmountInSatoshis: number;
  createTimestamp: number;
  type: LockTransactionType;
}

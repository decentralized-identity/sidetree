import LockTransactionType from '../enums/SavedLockType';

/**
 * Encapsulates the data about a bitcoin 'lock' transaction saved in the database.
 */
export default interface SavedLockModel {
  transactionId: string;
  rawTransaction: string;
  redeemScriptAsHex: string;

  /**
   * The desired lock amount which might be different from the actual amount locked. The
   * actual locked amount may be different as we lock more than the 'desired' amount to
   * account for any fee(s) required for relocking etc.
   */
  desiredLockAmountInSatoshis: number;
  createTimestamp: number;
  type: LockTransactionType;
}

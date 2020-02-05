import BitcoinLockTransactionType from '../enums/BitcoinLockTransactionType';

/**
 * Encapsulates the data about a bitcoin 'lock' transaction.
 */
export default interface BitcoinLockTransactionModel {
  transactionId: string;
  redeemScript: string;
  createTimestamp: number;
  type: BitcoinLockTransactionType;
}

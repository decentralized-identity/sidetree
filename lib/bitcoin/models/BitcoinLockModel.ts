import BitcoinLockType from '../enums/BitcoinLockType';

/**
 * Encapsulates the data about a bitcoin 'lock' transaction.
 */
export default interface BitcoinLockModel {
  transactionId: string;
  redeemScript: string;
  createTimestamp: number;
  type: BitcoinLockType;
}

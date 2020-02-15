/**
 * Encapsulates data about a lock transaction yet to be broadcasted.
 */
export default interface BitcoinLockTransactionModel {
  transactionId: string;
  transactionFee: number;
  redeemScriptAsHex: string;
  serializedTransactionObject: string;
}

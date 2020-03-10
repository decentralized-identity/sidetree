/**
 * Defines a Sidetree transaction.
 */
export default interface TransactionModel {
  transactionNumber: number;
  transactionTime: number;
  transactionTimeHash: string;
  anchorString: string;
  transactionFeePaid: number;
  normalizedTransactionFee: number;
  writer: string;
}

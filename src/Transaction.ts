/**
 * Defines a Sidetree transaction.
 */
export default interface Transaction {
  transactionNumber: number;
  transactionTime: number;
  transactionTimeHash: string;
  anchorFileHash: string;
}

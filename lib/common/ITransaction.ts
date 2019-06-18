/**
 * Defines a Sidetree transaction.
 */
export default interface ITransaction {
  transactionNumber: number;
  transactionTime: number;
  transactionTimeHash: string;
  anchorFileHash: string;
}

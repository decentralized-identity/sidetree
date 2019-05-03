/**
 * Defines a Sidetree transaction.
 */
export interface ITransaction {
  transactionNumber: number;
  transactionTime: number;
  transactionTimeHash: string;
  anchorFileHash: string;
}

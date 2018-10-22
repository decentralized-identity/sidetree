/**
 * Defines a Sidetree transaction.
 */
export default interface Transaction {
  blockNumber: number;
  transactionNumber: number;
  anchorFileHash: string;
}

/**
 * Defines a Sidetree transaction.
 */
export default interface Transaction {
  transactionNumber: number;
  transactionTime: number;
  transactionTimeHash: string;
  anchorFileHash: string;
}

/**
 * Defines a resolved Sidetree transaction.
 * A resolved transaction means the batch file is located in CAS.
 */
export interface ResolvedTransaction extends Transaction {
  batchFileHash: string;
}

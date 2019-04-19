/**
 * Defines a Sidetree transaction.
 */
export interface ITransaction {
  transactionNumber: number;
  transactionTime: number;
  transactionTimeHash: string;
  anchorFileHash: string;
}

/**
 * Defines a resolved Sidetree transaction.
 * A resolved transaction means the batch file is located in CAS.
 */
export interface IResolvedTransaction extends ITransaction {
  batchFileHash: string;
}

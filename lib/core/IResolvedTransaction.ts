import ITransaction from '../common/ITransaction';

/**
 * Defines a resolved Sidetree transaction.
 * A resolved transaction means the batch file is located in CAS.
 */
export default interface IResolvedTransaction extends ITransaction {
  batchFileHash: string;
}

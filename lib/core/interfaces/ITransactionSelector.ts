import TransactionModel from '../../common/models/TransactionModel';

/**
 * Rate limits transactions given a block of data
 */
export default interface ITransactionSelector {

  /**
   * Given an array of transactions in the same block, return the qualified transactions.
   * @param transactions An array of transactions to be throughput limited.
   */
  selectQualifiedTransactions (transactions: TransactionModel[]): Promise<TransactionModel[]>;
}

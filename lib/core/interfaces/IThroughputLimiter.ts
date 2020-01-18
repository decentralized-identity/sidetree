import TransactionModel from '../../common/models/TransactionModel';

/**
 * Rate limits transactions given a block of data
 */
export default interface IThroughputLimiter {

  /**
   * Given an array of transactions in the same block, return the qualified transactions
   * @param orderedTransactions An array of transactions which are ordered by transactionTime in ascending order
   */
  selectQualifiedTransactions (orderedTransactions: TransactionModel[]): Promise<TransactionModel[]>;
}

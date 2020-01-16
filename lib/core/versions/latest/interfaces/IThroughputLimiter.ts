import TransactionModel from '../../../../common/models/TransactionModel';

/**
 * Rate limits operations. only allow n number of highest fee transactions to pass.
 */
export default interface IThroughputLimiter {

  /**
   * Given an array of transactions, return the qualified transactions
   * @param orderedTransactions An array transactions which are ordered by transactionTime in ascending order
   */
  selectQualifiedTransactions (orderedTransactions: TransactionModel[]): Promise<TransactionModel[]>;
}

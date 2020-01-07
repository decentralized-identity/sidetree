import TransactionModel from '../../common/models/TransactionModel';

/**
 * Rate limits operations. only allow n number of highest fee transactions to pass.
 */
export default interface IOperationRateLimiter {

  /**
   * Given an array of transactions, return a subset of them which have high enough fee within their block to be processed. In the returned object,
   * also contains transactions that belong to an incomplete block at the end of the array
   * @param orderedTransactions An array transactions which are ordered by transactionTime in ascending order
   */
  getHighestFeeTransactionsPerBlock (orderedTransactions: TransactionModel[]): TransactionModel[];
}

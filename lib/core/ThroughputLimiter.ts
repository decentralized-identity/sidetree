import IVersionManager from './interfaces/IVersionManager';
import TransactionModel from '../common/models/TransactionModel';

/**
 * Keeps track of current block and throughput limits based on the state
 */
export default class ThroughputLimiter {

  constructor (
    private versionManager: IVersionManager
  ) {}

  /**
   * given a an array of transactions, return an array of qualified transactions per transaction time.
   * @param transactions array of transactions to filter for
   */
  public async getQualifiedTransactions (transactions: TransactionModel[]) {
    let currentTransactionTime: number | undefined;
    const transactionsGroupedByTransactionTime: TransactionModel[][] = [];

    for (const transaction of transactions) {
      // If transaction is transitioning into a new time, create a new grouping.
      if (transaction.transactionTime !== currentTransactionTime) {
        transactionsGroupedByTransactionTime.push([]);
        currentTransactionTime = transaction.transactionTime;
      }
      transactionsGroupedByTransactionTime[transactionsGroupedByTransactionTime.length - 1].push(transaction);
    }

    const qualifiedTransactions: TransactionModel[] = [];
    for (const transactionGroup of transactionsGroupedByTransactionTime) {
      const transactionSelector = this.versionManager.getTransactionSelector(transactionGroup[0].transactionTime);
      const qualifiedTransactionsInCurrentGroup = await transactionSelector.selectQualifiedTransactions(transactionGroup);
      qualifiedTransactions.push(...qualifiedTransactionsInCurrentGroup);
    }
    return qualifiedTransactions;
  }
}

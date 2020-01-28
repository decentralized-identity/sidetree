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
    let qualifiedTransactions: TransactionModel[] = [];
    let transactionsInCurrentTransactionTime: TransactionModel[] = [];
    let currentTransactionTime: number | undefined = undefined;

    for (const idx in transactions) {
      const transaction = transactions[idx];
      if (transaction.transactionTime === currentTransactionTime) {
        transactionsInCurrentTransactionTime.push(transaction);
      } else {
        if (currentTransactionTime !== undefined) {
          const transactionSelector = this.versionManager.getTransactionSelector(currentTransactionTime);
          const qualifiedTransactionsInCurrentBlock = await transactionSelector.selectQualifiedTransactions(transactionsInCurrentTransactionTime);
          qualifiedTransactions = qualifiedTransactions.concat(qualifiedTransactionsInCurrentBlock);
        }
        currentTransactionTime = transaction.transactionTime;
        transactionsInCurrentTransactionTime = [transaction];
      }

      // the last transaction time need to be processed
      if (Number(idx) === transactions.length - 1) {
        const transactionSelector = this.versionManager.getTransactionSelector(currentTransactionTime);
        const qualifiedTransactionsInCurrentBlock = await transactionSelector.selectQualifiedTransactions(transactionsInCurrentTransactionTime);
        qualifiedTransactions = qualifiedTransactions.concat(qualifiedTransactionsInCurrentBlock);
      }
    }

    return qualifiedTransactions;
  }
}

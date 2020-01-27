import IVersionManager from './interfaces/IVersionManager';
import TransactionModel from '../common/models/TransactionModel';

/**
 * Keeps track of current block and throughput limits based on the state
 */
export default class ThroughputLimiter {

  private currentBlockHeight: number | undefined;
  private transactionsInCurrentBlock: TransactionModel[];

  constructor (
    private versionManager: IVersionManager
  ) {
    this.transactionsInCurrentBlock = [];
  }

  /**
   * given a an array of transactions, return an array of qualified transactions based on current state
   * @param transactions array of transactions to filter for
   */
  public async getQualifiedTransactions (transactions: TransactionModel[]) {
    let qualifiedTransactions: TransactionModel[] = [];
    for (const transaction of transactions) {
      if (transaction.transactionTime === this.currentBlockHeight) {
        this.transactionsInCurrentBlock.push(transaction);
      } else {
        if (this.currentBlockHeight !== undefined) {
          const transactionSelector = this.versionManager.getTransactionSelector(this.currentBlockHeight);
          const qualifiedTransactionsInCurrentBlock = await transactionSelector.selectQualifiedTransactions(this.transactionsInCurrentBlock);
          qualifiedTransactions = qualifiedTransactions.concat(qualifiedTransactionsInCurrentBlock);
        }
        this.currentBlockHeight = transaction.transactionTime;
        this.transactionsInCurrentBlock = [transaction];
      }
    }

    return qualifiedTransactions;
  }

  /**
   * resets the state of ThroughputLimiter instance
   */
  public reset () {
    this.currentBlockHeight = undefined;
    this.transactionsInCurrentBlock = [];
  }
}

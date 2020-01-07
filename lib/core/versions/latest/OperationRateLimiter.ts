import IOperationRateLimiter from '../../interfaces/IOperationRateLimiter';
import TransactionModel from '../../../common/models/TransactionModel';
import PriorityQueue from 'priorityqueue';
import AnchoredDataSerializer from './AnchoredDataSerializer';

/**
 * rate limits how many operations is valid per block
 */
export default class OperationRateLimiter implements IOperationRateLimiter {
  private currentTransactionTime: number | undefined;
  private transactionsInCurrentTransactionTime: any;

  public constructor (
    private maxNumberOfOperationsPerBlock: number
  ) {

    const comparator = (a: TransactionModel, b: TransactionModel) => {
      return a.transactionFeePaid - b.transactionFeePaid;
    };

    this.transactionsInCurrentTransactionTime = new PriorityQueue({ comparator });
  }

  /**
   * Returns an array of transactions that should be processed
   * @param orderedTransactions The transactions that should be ranked
   */
  public getHighestFeeTransactionsPerBlock (orderedTransactions: TransactionModel[]): TransactionModel[] {
    let highestFeeTransactions: TransactionModel[] = [];
    for (const transaction of orderedTransactions) {
      if (transaction.transactionTime === this.currentTransactionTime) {
        this.transactionsInCurrentTransactionTime.push(transaction);
      } else {
        const highestFeeTransactionsInCurrentTransactionTime = this.getHighestFeeTransactionsFromCurrentTransactionTime();
        highestFeeTransactions = highestFeeTransactions.concat(highestFeeTransactionsInCurrentTransactionTime);

        this.currentTransactionTime = transaction.transactionTime;
        this.transactionsInCurrentTransactionTime.clear();
        this.transactionsInCurrentTransactionTime.push(transaction);
      }
    }
    return highestFeeTransactions;
  }

  private getHighestFeeTransactionsFromCurrentTransactionTime (): TransactionModel[] {
    let numberOfOperationsAvailableInCurrentBlock = 0;
    const transactionsToReturn = [];

    while (numberOfOperationsAvailableInCurrentBlock < this.maxNumberOfOperationsPerBlock && this.transactionsInCurrentTransactionTime.length) {
      const currentTransaction = this.transactionsInCurrentTransactionTime.pop();
      const numOfOperations = AnchoredDataSerializer.deserialize(currentTransaction.anchorString).numberOfOperations;

      numberOfOperationsAvailableInCurrentBlock += numOfOperations;
      if (numberOfOperationsAvailableInCurrentBlock <= this.maxNumberOfOperationsPerBlock) {
        transactionsToReturn.push(currentTransaction);
      }
    }

    return transactionsToReturn;
  }
}

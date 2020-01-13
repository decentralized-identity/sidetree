import AnchoredDataSerializer from './AnchoredDataSerializer';
import IOperationRateLimiter from '../../interfaces/IOperationRateLimiter';
import PriorityQueue from 'priorityqueue';
import TransactionModel from '../../../common/models/TransactionModel';

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
      // higher fee comes first. If fees are the same, earlier transaction comes first
      return a.transactionFeePaid - b.transactionFeePaid || b.transactionNumber - a.transactionNumber;
    };

    this.transactionsInCurrentTransactionTime = new PriorityQueue({ comparator });
  }

  /**
   * Returns an array of transactions that should be processed. Ranked by highest fee paid per transaction and up to the
   * max number of operations per block
   * @param orderedTransactions The transactions that should be ranked and considered to process
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

  /**
   * reset the OperationRateLimiter. Setting current transaction time to undefined and transactionsInCurrentTransactionTime to empty PQ
   */
  public clear (): void {
    this.currentTransactionTime = undefined;
    this.transactionsInCurrentTransactionTime.clear();
  }

  /**
   * Given transactions within a block, return the ones that should be processed.
   */
  private getHighestFeeTransactionsFromCurrentTransactionTime (): TransactionModel[] {
    let numberOfOperationsAvailableInCurrentBlock = 0;
    const transactionsToReturn = [];

    while (numberOfOperationsAvailableInCurrentBlock < this.maxNumberOfOperationsPerBlock && this.transactionsInCurrentTransactionTime.length) {
      const currentTransaction = this.transactionsInCurrentTransactionTime.pop();
      try {
        const numOfOperations = AnchoredDataSerializer.deserialize(currentTransaction.anchorString).numberOfOperations;

        numberOfOperationsAvailableInCurrentBlock += numOfOperations;
        if (numberOfOperationsAvailableInCurrentBlock <= this.maxNumberOfOperationsPerBlock) {
          transactionsToReturn.push(currentTransaction);
        }
      } catch (e) {
        transactionsToReturn.push(currentTransaction);
      }

    }

    // sort based on transaction number ascending
    return transactionsToReturn.sort((a, b) => { return a.transactionNumber - b.transactionNumber; });
  }
}

import AnchoredDataSerializer from './AnchoredDataSerializer';
import IThroughputLimiter from './interfaces/IThroughputLimiter';
import ITransactionStore from '../../interfaces/ITransactionStore';
import PriorityQueue from 'priorityqueue';
import TransactionModel from '../../../common/models/TransactionModel';
import { SidetreeError } from '../../Error';
import ErrorCode from './ErrorCode';

/**
 * rate limits how many operations is valid per block
 */
export default class OperationThroughputLimiter implements IThroughputLimiter {
  private transactionsPriorityQueue: any;
  public constructor (
    private maxNumberOfOperationsPerBlock: number,
    private transactionStore: ITransactionStore
  ) {

    const comparator = (a: TransactionModel, b: TransactionModel) => {
      // higher fee comes first. If fees are the same, earlier transaction comes first
      return a.transactionFeePaid - b.transactionFeePaid || b.transactionNumber - a.transactionNumber;
    };

    this.transactionsPriorityQueue = new PriorityQueue({ comparator });
  }

  /**
   * Returns an array of transactions that should be processed. Ranked by highest fee paid per transaction and up to the
   * max number of operations per block
   * @param orderedTransactions The transactions that should be ranked and considered to process
   */
  public async selectQualifiedTransactions (orderedTransactions: TransactionModel[]): Promise<TransactionModel[]> {
    if (!orderedTransactions.length) {
      return [];
    }

    const currentBlockHeight = orderedTransactions[0].transactionTime;
    for (const transaction of orderedTransactions) {
      if (transaction.transactionTime !== currentBlockHeight) {
        throw new SidetreeError(ErrorCode.TransactionsNotInSameBlock, 'transaction must be in the same block to perform rate limiting');
      }
      this.transactionsPriorityQueue.push(transaction);
    }

    let numberOfOperationsToQualify = this.maxNumberOfOperationsPerBlock - await this.getNumberOfOperationsAlreadyInBlock(currentBlockHeight);
    const transactionsToReturn = this.getHighestFeeTransactionsFromCurrentTransactionTime(numberOfOperationsToQualify);
    this.transactionsPriorityQueue.clear();
    return transactionsToReturn;
  }

  private async getNumberOfOperationsAlreadyInBlock (blockHeight: number): Promise<number> {
    const transactions = await this.transactionStore.getTransactionsByTransactionTime(blockHeight);
    let numberOfOperations = 0;
    if (transactions) {
      for (const transaction of transactions) {
        const numOfOperationsInCurrentTransaction = AnchoredDataSerializer.deserialize(transaction.anchorString).numberOfOperations;
        numberOfOperations += numOfOperationsInCurrentTransaction;
      }
    }
    return numberOfOperations;
  }

  /**
   * Given transactions within a block, return the ones that should be processed.
   */
  private getHighestFeeTransactionsFromCurrentTransactionTime (numberOfOperationsToQualify: number): TransactionModel[] {
    let numberOfOperationsSelected = 0;
    const transactionsToReturn = [];

    while (numberOfOperationsSelected < numberOfOperationsToQualify && this.transactionsPriorityQueue.length) {
      const currentTransaction = this.transactionsPriorityQueue.pop();
      const numOfOperationsInCurrentTransaction = AnchoredDataSerializer.deserialize(currentTransaction.anchorString).numberOfOperations;
      numberOfOperationsSelected += numOfOperationsInCurrentTransaction;

      if (numberOfOperationsSelected <= numberOfOperationsToQualify) {
        transactionsToReturn.push(currentTransaction);
      }

    }
    // sort based on transaction number ascending
    return transactionsToReturn.sort((a, b) => { return a.transactionNumber - b.transactionNumber; });
  }
}

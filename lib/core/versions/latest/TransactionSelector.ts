import AnchoredDataSerializer from './AnchoredDataSerializer';
import ErrorCode from './ErrorCode';
import ITransactionSelector from '../../interfaces/ITransactionSelector';
import ITransactionStore from '../../interfaces/ITransactionStore';
import PriorityQueue from 'priorityqueue';
import ProtocolParameters from './ProtocolParameters';
import SidetreeError from '../../../common/SidetreeError';
import TransactionModel from '../../../common/models/TransactionModel';

/**
 * rate limits how many operations is valid per block
 */
export default class TransactionSelector implements ITransactionSelector {
  private maxNumberOfOperationsPerBlock: number;
  private maxNumberOfTransactionsPerBlock: number;
  public constructor (
    private transactionStore: ITransactionStore
  ) {
    this.maxNumberOfOperationsPerBlock = ProtocolParameters.maxNumberOfOperationsPerTransactionTime;
    this.maxNumberOfTransactionsPerBlock = ProtocolParameters.maxNumberOfTransactionsPerTransactionTime;
  }

  private static getTransactionPriorityQueue () {
    const comparator = (a: TransactionModel, b: TransactionModel) => {
      // higher fee comes first. If fees are the same, earlier transaction comes first
      return a.transactionFeePaid - b.transactionFeePaid || b.transactionNumber - a.transactionNumber;
    };

    return new PriorityQueue({ comparator });
  }

  /**
   * Returns an array of transactions that should be processed. Ranked by highest fee paid per transaction and up to the
   * max number of operations per block
   * @param transactions The transactions that should be ranked and considered to process
   */
  public async selectQualifiedTransactions (transactions: TransactionModel[]): Promise<TransactionModel[]> {
    if (!transactions.length) {
      return [];
    }

    const transactionsPriorityQueue = TransactionSelector.getTransactionPriorityQueue();

    const currentBlockHeight = transactions[0].transactionTime;
    const writerToTransactionNumMap = new Map();
    for (const transaction of transactions) {
      // expect all transactions to be in the same transaction time
      if (transaction.transactionTime !== currentBlockHeight) {
        throw new SidetreeError(ErrorCode.TransactionsNotInSameBlock, 'transaction must be in the same block to perform rate limiting, investigate and fix');
      }
      // only 1 transaction is allowed per writer
      if (writerToTransactionNumMap.has(transaction.writer)) {
        const acceptedTransactionNum = writerToTransactionNumMap.get(transaction.writer);
        // tslint:disable-next-line:max-line-length
        console.info(`Multiple transactions found in block ${currentBlockHeight} from writer ${transaction.writer}, considering transaction ${acceptedTransactionNum} and ignoring ${transaction.transactionNumber}`);
      } else {
        transactionsPriorityQueue.push(transaction);
        writerToTransactionNumMap.set(transaction.writer, transaction.transactionNumber);
      }
    }

    const [numberOfOperations, numberOfTransactions] = await this.getNumberOfOperationsAndTransactionsAlreadyInBlock(currentBlockHeight);
    let numberOfOperationsToQualify = this.maxNumberOfOperationsPerBlock - numberOfOperations;
    let numberOfTransactionsToQualify = this.maxNumberOfTransactionsPerBlock - numberOfTransactions;

    const transactionsToReturn = TransactionSelector.getHighestFeeTransactionsFromCurrentTransactionTime(
      numberOfOperationsToQualify,
      numberOfTransactionsToQualify,
      transactionsPriorityQueue);

    return transactionsToReturn;
  }

  private async getNumberOfOperationsAndTransactionsAlreadyInBlock (blockHeight: number): Promise<number[]> {
    const transactions = await this.transactionStore.getTransactionsStartingFrom(blockHeight, blockHeight);
    let numberOfOperations = 0;
    if (transactions) {
      for (const transaction of transactions) {
        try {
          const numOfOperationsInCurrentTransaction = AnchoredDataSerializer.deserialize(transaction.anchorString).numberOfOperations;
          numberOfOperations += numOfOperationsInCurrentTransaction;
        } catch (e) {
          console.debug(`Error thrown in TransactionSelector: ${JSON.stringify(e, Object.getOwnPropertyNames(e))}`);
          console.info(`Transaction with anchor string ${transaction.anchorString} not considered as selected.`);
        }
      }
    }
    const numberOfTransactions = transactions ? transactions.length : 0;
    return [numberOfOperations, numberOfTransactions];
  }

  /**
   * Given transactions within a block, return the ones that should be processed.
   */
  private static getHighestFeeTransactionsFromCurrentTransactionTime (
    numberOfOperationsToQualify: number,
    numberOfTransactionsToQualify: number,
    transactionsPriorityQueue: any): TransactionModel[] {

    let numberOfOperationsSeen = 0;
    const transactionsToReturn = [];

    while (transactionsToReturn.length < numberOfTransactionsToQualify
      && numberOfOperationsSeen < numberOfOperationsToQualify
      && transactionsPriorityQueue.length > 0) {
      const currentTransaction = transactionsPriorityQueue.pop();
      try {
        const numOfOperationsInCurrentTransaction = AnchoredDataSerializer.deserialize(currentTransaction.anchorString).numberOfOperations;
        numberOfOperationsSeen += numOfOperationsInCurrentTransaction;
        if (numberOfOperationsSeen <= numberOfOperationsToQualify) {
          transactionsToReturn.push(currentTransaction);
        }
      } catch (e) {
        console.debug(`Error thrown in TransactionSelector: ${JSON.stringify(e, Object.getOwnPropertyNames(e))}`);
        console.info(`Transaction with anchor string ${currentTransaction.anchorString} not selected`);
      }
    }

    // sort based on transaction number ascending
    return transactionsToReturn;
  }
}

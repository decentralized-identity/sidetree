import ITransactionStore from '../core/interfaces/ITransactionStore';
import Logger from '../common/Logger';
import TransactionModel from '../common/models/TransactionModel';
import TransactionNumber from './TransactionNumber';

/**
 * Encapsulates the functionality to calculate the amount of spending that the
 * service is doing.
 */
export default class SpendingMonitor {

  private anchorStringsWritten: Set<string>;

  public constructor (
    private bitcoinFeeSpendingCutoffPeriodInBlocks: number,
    private bitcoinFeeSpendingCutoffInSatoshis: number,
    private transactionStore: ITransactionStore) {

    if (bitcoinFeeSpendingCutoffPeriodInBlocks < 1) {
      throw new Error(`Bitcoin spending cutoff period: ${bitcoinFeeSpendingCutoffPeriodInBlocks} must be greater than 1`);
    }

    if (bitcoinFeeSpendingCutoffInSatoshis <= 0) {
      throw new Error('Bitcoin spending cutoff amount must be > 0');
    }

    this.anchorStringsWritten = new Set<string>();
  }

  /**
   * Add the transaction data to track the spending.
   * @param anchorString The string to be written.
   */
  public addTransactionDataBeingWritten (anchorString: string): void {
    this.anchorStringsWritten.add(anchorString);
  }

  /**
   * Calculates whether the specified fee will keep this node within the spending limits.
   * @param currentFeeInSatoshis The fee to be added for the next transaction.
   * @param startingBlockHeight The block height to start the check for the cutoff period.
   */
  public async isCurrentFeeWithinSpendingLimit (currentFeeInSatoshis: number, lastProcessedBlockHeight: number): Promise<boolean> {

    // Special case for when the checking period is 1. Even though the algorithm later will
    // will work for this case, but we will avoid making a DB call.
    if (this.bitcoinFeeSpendingCutoffPeriodInBlocks === 1) {
      return (currentFeeInSatoshis <= this.bitcoinFeeSpendingCutoffInSatoshis);
    }

    // In order to calculate whether we are over the spending limit or not, our algorithm is:
    // <code>
    //   feesFromCutoffPeriod = transactionStore.get_fees_for_cutoff_period
    //   totalFees = currentFee + feesFromCutoffPeriod
    //   if (totalFees > spendingCutoff) { return true }
    // </code>
    //
    // Now remember that the currentFee input is for the next block (which is not written yet), so
    // the next block is included in the cutoff period. Also, the input lastProcessedBlockHeight is
    // also included in the cutoff period. So when we go back to the transaction store, we subtract
    // the these 2 blocks from the cutoff period. For example:
    //  - if the cutoff period is 2, then we want transactions from the last-processed-block and the next one.
    //  - if the cutoff period is 3, then we want transactions from the last-processed-block - 1, last-processed-block, and the next one
    const startingBlockHeight = lastProcessedBlockHeight - this.bitcoinFeeSpendingCutoffPeriodInBlocks - 2;

    // Now get the transactions from the store which are included in the above starting block and higher.
    const startingBlockFirstTxnNumber = TransactionNumber.construct(startingBlockHeight, 0);

    const allTxnsSinceStartingBlock =
      await this.transactionStore.getTransactionsLaterThan(startingBlockFirstTxnNumber - 1, undefined);

    // eslint-disable-next-line max-len
    Logger.info(`SpendingMonitor: total number of transactions from the transaction store starting from block: ${startingBlockHeight} are: ${allTxnsSinceStartingBlock.length}`);

    // Since the transactions from the store include transactions written by ALL the nodes in the network,
    // filter them to get the transactions that were written only by this node.
    const txnsWrittenByThisInstance = this.findTransactionsWrittenByThisNode(allTxnsSinceStartingBlock);
    Logger.info(`Number of transactions written by this instance: ${txnsWrittenByThisInstance.length}`);

    const totalFeeForRelatedTxns = txnsWrittenByThisInstance.reduce((total: number, currTxnModel: TransactionModel) => {
      return total + currTxnModel.transactionFeePaid;
    }, 0);

    const totalFeePlusCurrentFee = totalFeeForRelatedTxns + currentFeeInSatoshis;

    if (totalFeePlusCurrentFee > this.bitcoinFeeSpendingCutoffInSatoshis) {
      // eslint-disable-next-line max-len
      Logger.error(`Current fee (in satoshis): ${currentFeeInSatoshis} + total fees (${totalFeeForRelatedTxns}) since block number: ${startingBlockHeight} is greater than the spending cap: ${this.bitcoinFeeSpendingCutoffInSatoshis}`);
      return false;
    }

    return true;
  }

  /**
   * Finds the transactions which were written by this node. Really added to help with unit testing.
   * @param transactionsFromStore
   */
  private findTransactionsWrittenByThisNode (transactionsFromStore: TransactionModel[]): Array<TransactionModel> {
    // The transactions written by this node will include the anchor strings that we have been saving
    // so use that data to filter and return.
    const arraysToReturn = transactionsFromStore.filter((txn) => {
      return this.anchorStringsWritten.has(txn.anchorString);
    });

    return arraysToReturn;
  }
}

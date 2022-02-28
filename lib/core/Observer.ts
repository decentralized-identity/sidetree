import * as timeSpan from 'time-span';
import TransactionUnderProcessingModel, { TransactionProcessingStatus } from './models/TransactionUnderProcessingModel';
import EventCode from './EventCode';
import EventEmitter from '../common/EventEmitter';
import IBlockchain from './interfaces/IBlockchain';
import IConfirmationStore from './interfaces/IConfirmationStore';
import IOperationStore from './interfaces/IOperationStore';
import ITransactionProcessor from './interfaces/ITransactionProcessor';
import ITransactionStore from './interfaces/ITransactionStore';
import IUnresolvableTransactionStore from './interfaces/IUnresolvableTransactionStore';
import IVersionManager from './interfaces/IVersionManager';
import Logger from '../common/Logger';
import SharedErrorCode from '../common/SharedErrorCode';
import SidetreeError from '../common/SidetreeError';
import ThroughputLimiter from './ThroughputLimiter';
import TransactionModel from '../common/models/TransactionModel';

/**
 * Class that performs periodic processing of batches of Sidetree operations anchored to the blockchain.
 */
export default class Observer {

  /**
   * Denotes if the periodic transaction processing should continue to occur.
   * Used mainly for test purposes.
   */
  private continuePeriodicProcessing = false;

  /**
   * The list of transactions that are being downloaded or processed.
   */
  private transactionsUnderProcessing: TransactionUnderProcessingModel[] = [];

  /**
   * This is the transaction that is used as a cursor/timestamp to fetch newer transaction.
   */
  private cursorTransaction: TransactionModel | undefined;

  private throughputLimiter: ThroughputLimiter;

  public constructor (
    private versionManager: IVersionManager,
    private blockchain: IBlockchain,
    private maxConcurrentDownloads: number,
    private operationStore: IOperationStore,
    private transactionStore: ITransactionStore,
    private unresolvableTransactionStore: IUnresolvableTransactionStore,
    private confirmationStore: IConfirmationStore,
    private observingIntervalInSeconds: number) {
    this.throughputLimiter = new ThroughputLimiter(versionManager);
  }

  /**
   * The method that starts the periodic polling and processing of Sidetree operations.
   */
  public async startPeriodicProcessing () {
    Logger.info(`Starting periodic transactions processing.`);
    setImmediate(async () => {
      this.continuePeriodicProcessing = true;

      this.processTransactions();
    });
  }

  /**
   * Stops periodic transaction processing.
   * Mainly used for test purposes.
   */
  public stopPeriodicProcessing () {
    Logger.info(`Stopped periodic transactions processing.`);
    this.continuePeriodicProcessing = false;
  }

  /**
   * Processes new transactions if any, then reprocess a set of unresolvable transactions if any,
   * then schedules the next round of processing unless `stopPeriodicProcessing()` is invoked.
   */
  private async processTransactions () {
    try {
      // Optional update to store the processed transactions that completed in between the polling periods.
      await this.storeThenTrimConsecutiveTransactionsProcessed();

      // Keep fetching new Sidetree transactions from blockchain and processing them
      // until there are no more new transactions or there is a block reorganization.
      let moreTransactions = false;
      do {
        if (this.cursorTransaction === undefined) {
          this.cursorTransaction = await this.transactionStore.getLastTransaction();
        }
        const cursorTransactionNumber = this.cursorTransaction ? this.cursorTransaction.transactionNumber : undefined;
        const cursorTransactionTimeHash = this.cursorTransaction ? this.cursorTransaction.transactionTimeHash : undefined;
        const cursorTransactionTime = this.cursorTransaction ? this.cursorTransaction.transactionTime : 0;

        let invalidTransactionNumberOrTimeHash = false;
        let readResult;
        const endTimer = timeSpan(); // Measure time taken to go blockchain read.
        try {
          Logger.info('Fetching Sidetree transactions from blockchain service...');
          readResult = await this.blockchain.read(cursorTransactionNumber, cursorTransactionTimeHash);
          Logger.info(`Fetched ${readResult.transactions.length} Sidetree transactions from blockchain service in ${endTimer.rounded()} ms.`);
        } catch (error) {
          if (error instanceof SidetreeError && error.code === SharedErrorCode.InvalidTransactionNumberOrTimeHash) {
            Logger.info(`Invalid transaction number ${cursorTransactionNumber} or time hash ${cursorTransactionTimeHash} given to blockchain service.`);
            invalidTransactionNumberOrTimeHash = true;
          } else {
            throw error;
          }
        }

        const transactions = readResult ? readResult.transactions : [];
        moreTransactions = readResult ? readResult.moreTransactions : false;

        // Set the cursor for fetching of next transaction batch in the next loop.
        if (transactions.length > 0) {
          this.cursorTransaction = transactions[transactions.length - 1];
        }

        // Queue parallel downloading and processing of chunk files.
        let qualifiedTransactions = await this.throughputLimiter.getQualifiedTransactions(transactions);
        qualifiedTransactions = qualifiedTransactions.sort((a, b) => { return a.transactionNumber - b.transactionNumber; });
        for (const transaction of qualifiedTransactions) {
          const transactionUnderProcessing = {
            transaction: transaction,
            processingStatus: TransactionProcessingStatus.Processing
          };
          this.transactionsUnderProcessing.push(transactionUnderProcessing);
          // Intentionally not awaiting on downloading and processing each operation batch.
          this.processTransaction(transaction, transactionUnderProcessing);
        }

        // NOTE: Blockchain reorg has happened for sure only if `invalidTransactionNumberOrTimeHash` AND
        // latest transaction time is less or equal to blockchain service time.
        // This check will prevent Core from reverting transactions if/when blockchain service is re-initializing its data itself.
        let blockReorganizationDetected = false;
        if (invalidTransactionNumberOrTimeHash) {

          const latestBlockchainTime = await this.blockchain.getLatestTime();
          if (cursorTransactionTime <= latestBlockchainTime.time) {
            blockReorganizationDetected = true;
            moreTransactions = true;
          } else {
            Logger.info(`Blockchain microservice blockchain time is behind last known transaction time, waiting for blockchain microservice to catch up...`);
          }
        }

        // If block reorg is detected, we must wait until no more operation processing is pending,
        // then revert invalid transaction and operations.
        if (blockReorganizationDetected) {
          Logger.info(`Block reorganization detected.`);
          EventEmitter.emit(EventCode.SidetreeObserverBlockReorganization);

          await Observer.waitUntilCountOfTransactionsUnderProcessingIsLessOrEqualTo(this.transactionsUnderProcessing, 0);
          await this.storeThenTrimConsecutiveTransactionsProcessed(); // This is an optional optimization to give best the chance of minimal revert dataset.

          Logger.info(`Reverting invalid transactions...`);
          await this.revertInvalidTransactions();
          Logger.info(`Completed reverting invalid transactions.`);

          this.cursorTransaction = undefined;
        } else {
          // Else it means all transactions fetched are good for processing.

          // We hold off from fetching more transactions if the list of transactions under processing gets too long.
          // We will wait for count of transaction being processed to fall to the maximum allowed concurrent downloads
          // before attempting further transaction fetches.
          await Observer.waitUntilCountOfTransactionsUnderProcessingIsLessOrEqualTo(this.transactionsUnderProcessing, this.maxConcurrentDownloads);
          await this.storeThenTrimConsecutiveTransactionsProcessed();

          // If there is an error in processing a transaction that PREVENTS processing subsequent Sidetree transactions from the blockchain
          // (e.g. A DB outage/error that prevents us from recording a transaction for retries),
          // erase the entire list transactions under processing since processing MUST not advance beyond the transaction that failed processing.
          const hasErrorInTransactionProcessing = this.hasErrorInTransactionProcessing();
          if (hasErrorInTransactionProcessing) {
            // Step to defend against potential uncontrolled growth in `transactionsUnderProcessing` array size due to looping.
            await Observer.waitUntilCountOfTransactionsUnderProcessingIsLessOrEqualTo(this.transactionsUnderProcessing, 0);
            await this.storeThenTrimConsecutiveTransactionsProcessed();

            // Clear the the entire list of transactions under processing since we have cannot advance further due to error.
            this.transactionsUnderProcessing = [];
            this.cursorTransaction = undefined;
          }
        }
      } while (moreTransactions);

      Logger.info('Successfully kicked off downloading/processing of all new Sidetree transactions.');

      // Continue onto processing unresolvable transactions if any.
      await this.processUnresolvableTransactions();

      EventEmitter.emit(EventCode.SidetreeObserverLoopSuccess);
    } catch (error) {
      EventEmitter.emit(EventCode.SidetreeObserverLoopFailure);
      Logger.error(`Encountered unhandled and possibly fatal Observer error, must investigate and fix:`);
      Logger.error(error);
    } finally {
      if (this.continuePeriodicProcessing) {
        Logger.info(`Waiting for ${this.observingIntervalInSeconds} seconds before fetching and processing transactions again.`);
        setTimeout(async () => this.processTransactions(), this.observingIntervalInSeconds * 1000);
      }
    }
  }

  /**
   * Gets the total count of the transactions given that are still under processing.
   */
  private static getCountOfTransactionsUnderProcessing (transactionsUnderProcessing: TransactionUnderProcessingModel[]): number {
    const countOfTransactionsUnderProcessing = transactionsUnderProcessing.filter(
      transaction => transaction.processingStatus === TransactionProcessingStatus.Processing
    ).length;

    return countOfTransactionsUnderProcessing;
  }

  /**
   * Returns true if at least processing of one transaction resulted in an error that prevents advancement of transaction processing.
   */
  private hasErrorInTransactionProcessing (): boolean {
    const firstTransactionProcessingError = this.transactionsUnderProcessing.find(
      transaction => transaction.processingStatus === TransactionProcessingStatus.Error
    );

    return (firstTransactionProcessingError !== undefined);
  }

  private static async waitUntilCountOfTransactionsUnderProcessingIsLessOrEqualTo (
    transactionsUnderProcessing: TransactionUnderProcessingModel[],
    count: number) {

    let countOfTransactionsUnderProcessing = Observer.getCountOfTransactionsUnderProcessing(transactionsUnderProcessing);
    while (countOfTransactionsUnderProcessing > count) {
      // Wait a little before checking again.
      await new Promise(resolve => setTimeout(resolve, 1000));

      countOfTransactionsUnderProcessing = Observer.getCountOfTransactionsUnderProcessing(transactionsUnderProcessing);
    }
  }

  /**
   * Attempts to fetch and process unresolvable transactions due for retry.
   * Waits until all unresolvable transactions due for retry are processed.
   */
  private async processUnresolvableTransactions () {
    Logger.info(`Processing previously unresolvable transactions if any...`);

    const endTimer = timeSpan();
    const unresolvableTransactions = await this.unresolvableTransactionStore.getUnresolvableTransactionsDueForRetry();
    Logger.info(`Fetched ${unresolvableTransactions.length} unresolvable transactions to retry in ${endTimer.rounded()} ms.`);

    // Download and process each unresolvable transactions.
    const unresolvableTransactionStatus = [];
    for (const transaction of unresolvableTransactions) {
      const awaitingTransaction = {
        transaction: transaction,
        processingStatus: TransactionProcessingStatus.Processing
      };
      unresolvableTransactionStatus.push(awaitingTransaction);
      // Intentionally not awaiting on downloading and processing each operation batch.
      this.processTransaction(transaction, awaitingTransaction);
    }

    await Observer.waitUntilCountOfTransactionsUnderProcessingIsLessOrEqualTo(unresolvableTransactionStatus, 0);
  }

  /**
   * Goes through `transactionsUnderProcessing` in chronological order, records every consecutive processed transaction in the transaction store,
   * then remove them from `transactionsUnderProcessing` and update the in memory `lastConsecutivelyProcessedTransaction`.
   *
   * NOTE: this excludes transaction processing that resulted in `TransactionProcessingStatus.Error`,
   * because such error includes the case when the code fails to store the transaction to the retry table for future retry,
   * adding it to the transaction table means such transaction won't be processed again, resulting in missing operation data.
   * @returns The last transaction consecutively processed.
   */
  private async storeThenTrimConsecutiveTransactionsProcessed () {
    let lastConsecutivelyProcessedTransaction;
    let i = 0;
    while (i < this.transactionsUnderProcessing.length &&
          this.transactionsUnderProcessing[i].processingStatus === TransactionProcessingStatus.Processed) {

      lastConsecutivelyProcessedTransaction = this.transactionsUnderProcessing[i].transaction;
      await this.transactionStore.addTransaction(lastConsecutivelyProcessedTransaction);
      i++;
    }

    // Trim off consecutive transactions that are processed successfully.
    this.transactionsUnderProcessing.splice(0, i);
  }

  /**
   * Processes the given transaction by passing the transaction to the right version of the transaction processor based on the transaction time.
   * The transaction processing generically involves first downloading DID operation data from CAS (Content Addressable Storage),
   * then storing the operations indexed/grouped by DIDs in the persistent operation DB.
   */
  private async processTransaction (transaction: TransactionModel, transactionUnderProcessing: TransactionUnderProcessingModel) {
    let transactionProcessedSuccessfully;

    try {
      const transactionProcessor: ITransactionProcessor = this.versionManager.getTransactionProcessor(transaction.transactionTime);
      transactionProcessedSuccessfully = await transactionProcessor.processTransaction(transaction);
    } catch (error) {
      Logger.error(`Unhandled error encountered processing transaction '${transaction.transactionNumber}'.`);
      Logger.error(error);
      transactionProcessedSuccessfully = false;
    }

    Logger.info(`Transaction ${transaction.anchorString} is confirmed at ${transaction.transactionTime}`);
    await this.confirmationStore.confirm(transaction.anchorString, transaction.transactionTime);
    if (transactionProcessedSuccessfully) {
      Logger.info(`Removing transaction '${transaction.transactionNumber}' from unresolvable transactions if exists...`);
      this.unresolvableTransactionStore.removeUnresolvableTransaction(transaction); // Skip await since failure is not a critical and results in a retry.
    } else {
      try {
        Logger.info(`Recording failed processing attempt for transaction '${transaction.transactionNumber}'...`);
        await this.unresolvableTransactionStore.recordUnresolvableTransactionFetchAttempt(transaction);
      } catch (error) {
        transactionUnderProcessing.processingStatus = TransactionProcessingStatus.Error;

        Logger.error(`Error encountered saving unresolvable transaction '${transaction.transactionNumber}' for retry.`);
        Logger.error(error);
        return;
      }
    }

    Logger.info(`Finished processing transaction '${transaction.transactionNumber}'.`);
    transactionUnderProcessing.processingStatus = TransactionProcessingStatus.Processed;
  }

  /**
   * Reverts invalid transactions. Used in the event of a block-reorganization.
   */
  private async revertInvalidTransactions () {
    // Compute a list of exponentially-spaced transactions with their index, starting from the last transaction of the processed transactions.
    const exponentiallySpacedTransactions = await this.transactionStore.getExponentiallySpacedTransactions();

    // Find a known valid Sidetree transaction that is prior to the block reorganization.
    const bestKnownValidRecentTransaction =
      await this.blockchain.getFirstValidTransaction(exponentiallySpacedTransactions);

    const bestKnownValidRecentTransactionNumber = bestKnownValidRecentTransaction === undefined ? undefined : bestKnownValidRecentTransaction.transactionNumber;
    Logger.info(`Best known valid recent transaction: ${bestKnownValidRecentTransactionNumber}`);

    // Revert all processed operations that came after the best known valid recent transaction.
    Logger.info('Reverting operations...');
    await this.operationStore.delete(bestKnownValidRecentTransactionNumber);

    await this.unresolvableTransactionStore.removeUnresolvableTransactionsLaterThan(bestKnownValidRecentTransactionNumber);

    await this.confirmationStore.resetAfter(bestKnownValidRecentTransaction?.transactionTime);

    // NOTE: MUST do steps below LAST in this particular order to handle incomplete operation rollback due to unexpected scenarios, such as power outage etc.
    await this.transactionStore.removeTransactionsLaterThan(bestKnownValidRecentTransactionNumber);
  }
}

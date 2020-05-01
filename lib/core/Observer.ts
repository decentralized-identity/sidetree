import IBlockchain from './interfaces/IBlockchain';
import IOperationStore from './interfaces/IOperationStore';
import ITransactionProcessor from './interfaces/ITransactionProcessor';
import ITransactionStore from './interfaces/ITransactionStore';
import IUnresolvableTransactionStore from './interfaces/IUnresolvableTransactionStore';
import IVersionManager from './interfaces/IVersionManager';
import SharedErrorCode from '../common/SharedErrorCode';
import SidetreeError from '../common/SidetreeError';
import timeSpan = require('time-span');
import ThroughputLimiter from './ThroughputLimiter';
import TransactionModel from '../common/models/TransactionModel';
import TransactionUnderProcessingModel, { TransactionProcessingStatus } from './models/TransactionUnderProcessingModel';

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
   * This is the transaction that is used as a timestamp to fetch newer transaction.
   */
  private lastKnownTransaction: TransactionModel | undefined;

  private throughputLimiter: ThroughputLimiter;

  public constructor (
    private versionManager: IVersionManager,
    private blockchain: IBlockchain,
    private maxConcurrentDownloads: number,
    private operationStore: IOperationStore,
    private transactionStore: ITransactionStore,
    private unresolvableTransactionStore: IUnresolvableTransactionStore,
    private observingIntervalInSeconds: number) {
    this.throughputLimiter = new ThroughputLimiter(versionManager);
  }

  /**
   * The method that starts the periodic polling and processing of Sidetree operations.
   */
  public async startPeriodicProcessing () {
    // Initialize the last known transaction before starting processing.
    this.lastKnownTransaction = await this.transactionStore.getLastTransaction();

    console.info(`Starting periodic transactions processing.`);
    setImmediate(async () => {
      this.continuePeriodicProcessing = true;

      // tslint:disable-next-line:no-floating-promises - this.processTransactions() never throws.
      this.processTransactions();
    });
  }

  /**
   * Stops periodic transaction processing.
   * Mainly used for test purposes.
   */
  public stopPeriodicProcessing () {
    console.info(`Stopped periodic transactions processing.`);
    this.continuePeriodicProcessing = false;
  }

  /**
   * Processes new transactions if any, then reprocess a set of unresolvable transactions if any,
   * then schedules the next round of processing unless `stopPeriodicProcessing()` is invoked.
   */
  private async processTransactions () {
    try {
      await this.storeConsecutiveTransactionsProcessed(); // Do this in multiple places

      // Keep fetching new Sidetree transactions from blockchain and processing them
      // until there are no more new transactions or there is a block reorganization.
      let moreTransactions = false;
      do {
        // Get the last transaction to be used as a timestamp to fetch new transactions.
        const lastKnownTransactionNumber = this.lastKnownTransaction ? this.lastKnownTransaction.transactionNumber : undefined;
        const lastKnownTransactionTimeHash = this.lastKnownTransaction ? this.lastKnownTransaction.transactionTimeHash : undefined;
        const lastKnownTransactionTime = this.lastKnownTransaction ? this.lastKnownTransaction.transactionTime : 0;

        let invalidTransactionNumberOrTimeHash = false;
        let readResult;
        const endTimer = timeSpan(); // Measure time taken to go blockchain read.
        try {
          console.info('Fetching Sidetree transactions from blockchain service...');
          readResult = await this.blockchain.read(lastKnownTransactionNumber, lastKnownTransactionTimeHash);
          console.info(`Fetched ${readResult.transactions.length} Sidetree transactions from blockchain service in ${endTimer.rounded()} ms.`);
        } catch (error) {
          if (error instanceof SidetreeError && error.code === SharedErrorCode.InvalidTransactionNumberOrTimeHash) {
            console.info(`Invalid transaction number ${lastKnownTransactionNumber} or time hash ${lastKnownTransactionTimeHash} given to blockchain service.`);
            invalidTransactionNumberOrTimeHash = true;
          } else {
            throw error;
          }
        }

        const transactions = readResult ? readResult.transactions : [];
        moreTransactions = readResult ? readResult.moreTransactions : false;
        let qualifiedTransactions = await this.throughputLimiter.getQualifiedTransactions(transactions);
        qualifiedTransactions = qualifiedTransactions.sort((a, b) => { return a.transactionNumber - b.transactionNumber; });

        // Queue parallel downloading and processing of chunk files.
        for (const transaction of qualifiedTransactions) {
          const awaitingTransaction = {
            transaction: transaction,
            processingStatus: TransactionProcessingStatus.Pending
          };
          this.transactionsUnderProcessing.push(awaitingTransaction);
          // Intentionally not awaiting on downloading and processing each operation batch.
          void this.processTransaction(transaction, awaitingTransaction);
        }

        // NOTE: Blockchain reorg has happened for sure only if `invalidTransactionNumberOrTimeHash` AND
        // latest transaction time is less or equal to blockchain service time.
        // This check will prevent Core from reverting transactions if/when blockchain service is reinitializing its data itself.
        let blockReorganizationDetected = false;
        if (invalidTransactionNumberOrTimeHash) {
          if (lastKnownTransactionTime <= this.blockchain.approximateTime.time) {
            blockReorganizationDetected = true;
            moreTransactions = true;
          } else {
            console.info(`Blockchain microservice blockchain time is behind last known transaction time, waiting for blockchain microservice to catch up...`);
          }
        }

        // If block reorg is detected, we must wait until no more operation processing is pending,
        // then revert invalid transaction and operations.
        if (blockReorganizationDetected) {
          console.info(`Block reorganization detected.`);
          await this.waitUntilCountOfTransactionsUnderProcessingIsLessOrEqualTo(0);

          console.info(`Reverting invalid transactions...`);
          await this.revertInvalidTransactions();
          console.info(`Completed reverting invalid transactions.`);
        } else {
          // Else it means transaction fetch was successful:
          // We hold off from fetching more transactions if the list of transactions under processing gets too long.
          // We will wait for count of transaction being processed to fall to the maximum allowed concurrent downloads
          // before attempting further transaction fetches.
          await this.waitUntilCountOfTransactionsUnderProcessingIsLessOrEqualTo(this.maxConcurrentDownloads);
        }

        // Update the last known transaction.
        // NOTE: In case of block reorg, last known transaction will be updated in `this.RevertInvalidTransactions()` method.
        if (transactions && transactions.length > 0) {
          this.lastKnownTransaction = transactions[transactions.length - 1];
        }
      } while (moreTransactions);

      await this.storeConsecutiveTransactionsProcessed();
      console.info('Successfully kicked off downloading/processing of all new Sidetree transactions.');

      // Continue onto processing unresolvable transactions if any.
      await this.processUnresolvableTransactions();
    } catch (error) {
      console.error(`Encountered unhandled and possibly fatal Observer error, must investigate and fix:`);
      console.error(error);
    } finally {
      if (this.continuePeriodicProcessing) {
        console.info(`Waiting for ${this.observingIntervalInSeconds} seconds before fetching and processing transactions again.`);
        setTimeout(async () => this.processTransactions(), this.observingIntervalInSeconds * 1000);
      }
    }
  }

  private async waitUntilCountOfTransactionsUnderProcessingIsLessOrEqualTo (count: number) {
    while (this.transactionsUnderProcessing.length > count) {
      // Store the consecutively processed transactions in the transaction store.
      await this.storeConsecutiveTransactionsProcessed();

      // Wait a little before checking again.
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return;
  }

  /**
   * Attempts to fetch and process unresolvable transactions due for retry.
   * Waits until all unresolvable transactions due for retry are processed.
   */
  private async processUnresolvableTransactions () {
    const endTimer = timeSpan();
    const unresolvableTransactions = await this.unresolvableTransactionStore.getUnresolvableTransactionsDueForRetry();
    console.info(`Fetched ${unresolvableTransactions.length} unresolvable transactions to retry in ${endTimer.rounded()} ms.`);

    // Download and process each unresolvable transactions.
    const unresolvableTransactionStatus = [];
    for (const transaction of unresolvableTransactions) {
      const awaitingTransaction = {
        transaction: transaction,
        processingStatus: TransactionProcessingStatus.Pending
      };
      unresolvableTransactionStatus.push(awaitingTransaction);
      // Intentionally not awaiting on downloading and processing each operation batch.
      void this.processTransaction(transaction, awaitingTransaction);
    }

    // Wait until all unresolvable transactions are processed,
    while (unresolvableTransactionStatus.length > 0) {
      // Find the index of the first transaction that is not processed yet.
      let i = 0;
      while (i < unresolvableTransactionStatus.length &&
             unresolvableTransactionStatus[i].processingStatus === TransactionProcessingStatus.Processsed) {
        i++;
      }

      // Trim the parallelized transaction list.
      unresolvableTransactionStatus.splice(0, i);

      // Wait a little before checking again.
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  /**
   * Goes through the `transactionsUnderProcessing` in chronological order, records each processed transaction
   * in the transaction store and remove it from `transactionsUnderProcessing` until a transaction that has not been processed yet is hit.
   */
  private async storeConsecutiveTransactionsProcessed () {
    let i = 0;
    while (i < this.transactionsUnderProcessing.length &&
          this.transactionsUnderProcessing[i].processingStatus === TransactionProcessingStatus.Processsed) {
      await this.transactionStore.addTransaction(this.transactionsUnderProcessing[i].transaction);
      i++;
    }

    // Trim the transaction list.
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
      console.error(`Unhandled error encountered processing transaction '${transaction.transactionNumber}'.`);
      console.error(error);
      transactionProcessedSuccessfully = false;
    } finally {
      // Purposely setting processing status first before rest of the code to prevent any possibility of deadlocking the Observer.
      console.info(`Finished processing transaction '${transaction.transactionNumber}'.`);
      transactionUnderProcessing.processingStatus = TransactionProcessingStatus.Processsed;

      if (transactionProcessedSuccessfully) {
        console.info(`Removing transaction '${transaction.transactionNumber}' from unresolvable transactions if exists...`);
        await this.unresolvableTransactionStore.removeUnresolvableTransaction(transaction);
      } else {
        console.info(`Recording failed processing attempt for transaction '${transaction.transactionNumber}'...`);
        await this.unresolvableTransactionStore.recordUnresolvableTransactionFetchAttempt(transaction);
      }
    }
  }

  /**
   * Reverts invalid transactions. Used in the event of a block-reorganization.
   */
  private async revertInvalidTransactions () {
    // Compute a list of exponentially-spaced transactions with their index, starting from the last transaction of the processed transactions.
    const exponentiallySpacedTransactions = await this.transactionStore.getExponentiallySpacedTransactions();

    // Find a known valid Sidetree transaction that is prior to the block reorganization.
    const bestKnownValidRecentTransaction
      = await this.blockchain.getFirstValidTransaction(exponentiallySpacedTransactions);

    const bestKnownValidRecentTransactionNumber = bestKnownValidRecentTransaction === undefined ? undefined : bestKnownValidRecentTransaction.transactionNumber;
    console.info(`Best known valid recent transaction: ${bestKnownValidRecentTransactionNumber}`);

    // Revert all processed operations that came after the best known valid recent transaction.
    console.info('Reverting operations...');
    await this.operationStore.delete(bestKnownValidRecentTransactionNumber);

    // NOTE: MUST do this step LAST to handle incomplete operation rollback due to unexpected scenarios, such as power outage etc.
    await this.transactionStore.removeTransactionsLaterThan(bestKnownValidRecentTransactionNumber);
    await this.unresolvableTransactionStore.removeUnresolvableTransactionsLaterThan(bestKnownValidRecentTransactionNumber);

    // Reset the in-memory last known good Transaction so we next processing cycle will fetch from the correct timestamp/maker.
    this.lastKnownTransaction = bestKnownValidRecentTransaction;
  }
}

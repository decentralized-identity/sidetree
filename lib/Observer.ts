import AnchorFile, { IAnchorFile } from './AnchorFile';
import BatchFile from './BatchFile';
import DownloadManager from './DownloadManager';
import OperationProcessor from './OperationProcessor';
import timeSpan = require('time-span');
import { Blockchain } from './Blockchain';
import { ErrorCode, SidetreeError } from './Error';
import { IResolvedTransaction, ITransaction } from './Transaction';
import { Operation } from './Operation';
import { TransactionStore } from './TransactionStore';

/**
 * The state of a transaction that is being processed.
 */
enum TransactionProcessingStatus {
  Pending,
  Processsed
}

/**
 * Data structure for holding a transaction that is being processed and its state.
 */
interface ITransactionUnderProcessing {
  transaction: ITransaction;
  processingStatus: TransactionProcessingStatus;
}

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
  private transactionsUnderProcessing: { transaction: ITransaction; processingStatus: TransactionProcessingStatus }[] = [];

  /**
   * This is the transaction that is used as a timestamp to fetch newer transaction.
   */
  private lastKnownTransaction: ITransaction | undefined;

  public constructor (
    private blockchain: Blockchain,
    private downloadManager: DownloadManager,
    private operationProcessor: OperationProcessor,
    private transactionStore: TransactionStore,
    private observingIntervalInSeconds: number) {
  }

  /**
   * The function that starts the periodic polling and processing of Sidetree operations.
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
   * then scehdules the next round of processing using the following rules unless `stopPeriodicProcessing()` is invoked.
   */
  public async processTransactions () {
    let blockReorganizationDetected = false;
    try {
      await this.storeConsecutiveTransactionsProcessed(); // Do this in multiple places

      // Keep fetching new Sidetree transactions from blockchain and processing them
      // until there are no more new transactions or there is a block reorganization.
      let moreTransactions = false;
      do {
        // Get the last transaction to be used as a timestamp to fetch new transactions.
        const lastKnownTransactionNumber = this.lastKnownTransaction ? this.lastKnownTransaction.transactionNumber : undefined;
        const lastKnownTransactionTimeHash = this.lastKnownTransaction ? this.lastKnownTransaction.transactionTimeHash : undefined;

        let readResult;
        const endTimer = timeSpan(); // Measure time taken to go blockchain read.
        try {
          console.info('Fetching Sidetree transactions from blockchain service...');
          readResult = await this.blockchain.read(lastKnownTransactionNumber, lastKnownTransactionTimeHash);
          console.info(`Fetched ${readResult.transactions.length} Sidetree transactions from blockchain service in ${endTimer.rounded()} ms.`);
        } catch (error) {
          // If block reorganization (temporary fork) has happened.
          if (error instanceof SidetreeError && error.errorCode === ErrorCode.InvalidTransactionNumberOrTimeHash) {
            console.info(`Block reorganization detected.`);
            blockReorganizationDetected = true;
            moreTransactions = true;
          } else {
            throw error;
          }
        }

        let transactions = readResult ? readResult.transactions : [];
        moreTransactions = readResult ? readResult.moreTransactions : false;

        // Queue parallel downloading and processing of batch files.
        for (const transaction of transactions) {
          const awaitingTransaction = {
            transaction: transaction,
            processingStatus: TransactionProcessingStatus.Pending
          };
          this.transactionsUnderProcessing.push(awaitingTransaction);
          // Intentionally not awaiting on downloading and processing each operation batch.
          void this.downloadThenProcessBatchAsync(transaction, awaitingTransaction);
        }

        // If block reorg is detected, we must wait until no more operation processing is pending,
        // then revert invalid transaction and operations.
        if (blockReorganizationDetected) {
          console.info(`Block reorganization detected.`);
          await this.waitUntilCountOfTransactionsUnderProcessingIsLessOrEqualTo(0);

          console.info(`Reverting invalid transactions...`);
          await this.RevertInvalidTransactions();
          console.info(`Completed reverting invalid transactions.`);
        } else {
          // Else it means transaction fetch was successful:
          // We hold off from fetching more transactions if the list of transactions under processing gets too long.
          // We will wait for count of transaction being processed to fall to the maximum allowed concurrent downloads
          // before attempting further transaction fetches.
          await this.waitUntilCountOfTransactionsUnderProcessingIsLessOrEqualTo(this.downloadManager.maxConcurrentDownloads);
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
    const unresolvableTransactions = await this.transactionStore.getUnresolvableTransactionsDueForRetry();
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
      void this.downloadThenProcessBatchAsync(transaction, awaitingTransaction);
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
      await this.transactionStore.addProcessedTransaction(this.transactionsUnderProcessing[i].transaction);
      i++;
    }

    // Trim the transaction list.
    this.transactionsUnderProcessing.splice(0, i);
  }
  /**
   * Processes the given transaction.
   * If the given transaction is unresolvable (anchor/batch file not found), save the transaction for retry.
   * If no error encountered (unresolvable transaction is NOT an error), advance the 'last processed transaction' marker.
   */
  private async downloadThenProcessBatchAsync (transaction: ITransaction, transactionUnderProcessing: ITransactionUnderProcessing) {
    let retryNeeded = false;

    try {
      console.info(`Downloading anchor file '${transaction.anchorFileHash}'...`);
      const anchorFileBuffer = await this.downloadManager.download(transaction.anchorFileHash);

      if (anchorFileBuffer === undefined) {
        retryNeeded = true;
        return;
      }

      let anchorFile: IAnchorFile;
      try {
        anchorFile = AnchorFile.parseAndValidate(anchorFileBuffer);
      } catch {
        console.info(`Anchor file '${transaction.anchorFileHash}' failed parsing/validation, transaction '${transaction.transactionNumber}' ignored...`);
        return;
      }

      console.info(`Downloading batch file '${anchorFile.batchFileHash}'...`);
      const batchFileBuffer = await this.downloadManager.download(anchorFile.batchFileHash);

      if (batchFileBuffer === undefined) {
        retryNeeded = true;
        return;
      }

      // Construct a resolved transaction from the original transaction object now that batch file is fetched.
      const resolvedTransaction: IResolvedTransaction = {
        transactionNumber: transaction.transactionNumber,
        transactionTime: transaction.transactionTime,
        transactionTimeHash: transaction.transactionTimeHash,
        anchorFileHash: transaction.anchorFileHash,
        batchFileHash: anchorFile.batchFileHash
      };

      let operations: Operation[];
      try {
        operations = await BatchFile.parseAndValidate(batchFileBuffer, anchorFile, resolvedTransaction);
      } catch {
        console.info(`Batch file '${anchorFile.batchFileHash}' failed parsing/validation, transaction '${transaction.transactionNumber}' ignored.`);
        return;
      }

      // If the code reaches here, it means that the batch of operations is valid, process the operations.
      const endTimer = timeSpan();
      await this.operationProcessor.processBatch(operations);
      console.info(`Processed batch '${anchorFile.batchFileHash}' of ${operations.length} operations. Time taken: ${endTimer.rounded()} ms.`);
    } catch (error) {
      console.error(`Unhandled error encoutnered processing transaction '${transaction.transactionNumber}'.`);
      console.error(error);
      retryNeeded = true;
    } finally {
      transactionUnderProcessing.processingStatus = TransactionProcessingStatus.Processsed;

      if (retryNeeded) {
        await this.transactionStore.recordUnresolvableTransactionFetchAttempt(transaction);
      } else {
        await this.transactionStore.removeUnresolvableTransaction(transaction);
      }
    }
  }

  /**
   * Reverts invalid transactions. Used in the event of a block-reorganization.
   */
  private async RevertInvalidTransactions () {
    // Compute a list of exponentially-spaced transactions with their index, starting from the last transaction of the processed transactions.
    const exponentiallySpacedTransactions = await this.transactionStore.getExponentiallySpacedTransactions();

    // Find a known valid Sidetree transaction that is prior to the block reorganization.
    const bestKnownValidRecentTransaction
      = await this.blockchain.getFirstValidTransaction(exponentiallySpacedTransactions);

    const bestKnownValidRecentTransactionNumber = bestKnownValidRecentTransaction === undefined ? undefined : bestKnownValidRecentTransaction.transactionNumber;
    console.info(`Best known valid recent transaction: ${bestKnownValidRecentTransactionNumber}`);

    // Revert all processed operations that came after the best known valid recent transaction.
    console.info('Reverting operations...');
    await this.operationProcessor.rollback(bestKnownValidRecentTransactionNumber);

    // NOTE: MUST do this step LAST to handle incomplete operation rollback due to unexpected scenarios, such as power outage etc.
    await this.transactionStore.removeTransactionsLaterThan(bestKnownValidRecentTransactionNumber);

    // Reset the in-memory last known good Tranaction so we next processing cycle will fetch from the correct timestamp/maker.
    this.lastKnownTransaction = bestKnownValidRecentTransaction;
  }
}

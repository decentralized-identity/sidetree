import DownloadManager from './DownloadManager';
import Encoder from './Encoder';
import Logger from './lib/Logger';
import timeSpan = require('time-span');
import Transaction, { ResolvedTransaction } from './Transaction';
import { Blockchain } from './Blockchain';
import { ErrorCode, SidetreeError } from './Error';
import { getProtocol } from './Protocol';
import { InMemoryTransactionStore } from './TransactionStore';
import { Operation } from './Operation';
import { OperationProcessor } from './OperationProcessor';

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
interface TransactionUnderProcessing {
  transaction: Transaction;
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
   * Data store that stores the state of processed transactions.
   */
  private transactionStore = new InMemoryTransactionStore();

  /**
   * The list of transactions that are being downloaded or processed.
   */
  private transactionsUnderProcessing: { transaction: Transaction; processingStatus: TransactionProcessingStatus }[] = [];

  /**
   * This is the transaction that is used as a timestamp to fetch newer transaction.
   */
  private lastKnownTransaction: Transaction | undefined;

  public constructor (
    private blockchain: Blockchain,
    private downloadManager: DownloadManager,
    private operationProcessor: OperationProcessor,
    private pollingIntervalInSeconds: number) {
  }

  /**
   * The function that starts the periodic polling and processing of Sidetree operations.
   */
  public async startPeriodicProcessing () {
    // Initialize the last known transaction before starting processing.
    this.lastKnownTransaction = await this.transactionStore.getLastTransaction();

    Logger.info(`Starting periodic transactions processing.`);
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
    Logger.info(`Stopped periodic transactions processing.`);
    this.continuePeriodicProcessing = false;
  }

  /**
   * Gets the list of processed transactions.
   * Mainly used for test purposes.
   */
  public getProcessedTransactions (): Transaction[] {
    return this.transactionStore.getProcessedTransactions();
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
          Logger.info('Fetching Sidetree transactions from blockchain service...');
          readResult = await this.blockchain.read(lastKnownTransactionNumber, lastKnownTransactionTimeHash);
          Logger.info(`Fetched ${readResult.transactions.length} Sidetree transactions from blockchain service in ${endTimer.rounded()} ms.`);
        } catch (error) {
          // If block reorganization (temporary fork) has happened.
          if (error instanceof SidetreeError && error.errorCode === ErrorCode.InvalidTransactionNumberOrTimeHash) {
            Logger.info(`Block reorganization detected.`);
            blockReorganizationDetected = true;
            moreTransactions = true;
          } else {
            throw error;
          }
        }

        let transactions = readResult ? readResult.transactions : [];
        moreTransactions = readResult ? readResult.moreTransactions : false;

        // Queue parallel downloading and processing of batch files.
        Logger.info(`Queueing parallel downloading and processing of operation batches of ${transactions.length} transactions...`);
        for (const transaction of transactions) {
          const awaitingTransaction = {
            transaction: transaction,
            processingStatus: TransactionProcessingStatus.Pending
          };
          this.transactionsUnderProcessing.push(awaitingTransaction);
          // Intentionally not awaiting on downloading and processing each operation batch.
          void this.downloadThenProcessBatchAsync(transaction, awaitingTransaction);
        }
        Logger.info(`Queued downloading and processing of operation batches of ${transactions.length} transactions.`);

        // If block reorg is detected, we must wait until no more operation processing is pending,
        // then revert invalid transaction and operations.
        if (blockReorganizationDetected) {
          Logger.info(`Block reorganization deteced.`);
          await this.waitUntilCountOfTransactionsUnderProcessingIsLessOrEqualTo(0);

          Logger.info(`Reverting invalid transactions...`);
          await this.RevertInvalidTransactions();
          Logger.info(`Completed reverting invalid transactions.`);
        } else {
          // Else it means transaction fetch was successful:
          // We hold off from fetching more transactions if the list of transactions under processing gets too long.
          // We will wait for count of transaction being processed to fall to the maximum allowed concurrent downloads
          // before attempting further transaction fetches.
          await this.waitUntilCountOfTransactionsUnderProcessingIsLessOrEqualTo(this.downloadManager.maxConcurrentCasDownloads);
        }

        // Update the last known transaction.
        // NOTE: In case of block reorg, last known transaction will be updated in `this.RevertInvalidTransactions()` method.
        if (transactions && transactions.length > 0) {
          this.lastKnownTransaction = transactions[transactions.length - 1];
        }
      } while (moreTransactions);

      await this.storeConsecutiveTransactionsProcessed();
      Logger.info('Successfully kicked off downloading/processing of all new Sidetree transactions.');

      // Continue onto processing unresolvable transactions if any.
      await this.processUnresolvableTransactions();
    } catch (error) {
      Logger.error(`Encountered unhandled and possibly fatal Observer error, must investigate and fix:`);
      Logger.error(error);
    } finally {
      if (this.continuePeriodicProcessing) {
        Logger.info(`Waiting for ${this.pollingIntervalInSeconds} seconds before fetching and processing transactions again.`);
        setTimeout(async () => this.processTransactions(), this.pollingIntervalInSeconds * 1000);
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
    const unresolvableTransactions = await this.transactionStore.getUnresolvableTransactionsToRetry();
    Logger.info(`Fetched ${unresolvableTransactions.length} unresolvable transactions to retry in ${endTimer.rounded()} ms.`);

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
  private async downloadThenProcessBatchAsync (transaction: Transaction, transactionUnderProcessing: TransactionUnderProcessing) {
    Logger.info(`Downloading then processing transaction '${transaction.transactionNumber}' with anchor file '${transaction.anchorFileHash}'...`);
    let retryNeeded = false;

    try {
      const anchorFileBuffer = await this.downloadManager.download(transaction.anchorFileHash);

      if (anchorFileBuffer === undefined) {
        retryNeeded = true;
        return;
      }

      let anchorFile;
      try {
        anchorFile = JSON.parse(anchorFileBuffer.toString());
        // TODO: Issue https://github.com/decentralized-identity/sidetree-core/issues/129 - Perform schema validation.
      } catch {
        // Invalid transaction, no further processing will ever be possible.
        return;
      }

      const batchFileBuffer = await this.downloadManager.download(anchorFile.batchFileHash);

      if (batchFileBuffer === undefined) {
        retryNeeded = true;
        return;
      }

      // Construct a resolved transaction from the original transaction object now that batch file is fetched.
      const resolvedTransaction: ResolvedTransaction = {
        transactionNumber: transaction.transactionNumber,
        transactionTime: transaction.transactionTime,
        transactionTimeHash: transaction.transactionTimeHash,
        anchorFileHash: transaction.anchorFileHash,
        batchFileHash: anchorFile.batchFileHash
      };

      await this.processResolvedTransaction(resolvedTransaction, batchFileBuffer);
    } catch (e) {
      Logger.error(`Unhandled error encoutnered processing transaction '${transaction.transactionNumber}'.`);
      Logger.error(e);
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

  private async processResolvedTransaction (resolvedTransaction: ResolvedTransaction, batchFileBuffer: Buffer) {
    // Validate the batch file.
    const operations: Operation[] = [];
    try {
      let endTimer = timeSpan();
      const batchFile = JSON.parse(batchFileBuffer.toString());
      Logger.info(`Parsed batch file ${resolvedTransaction.batchFileHash} in ${endTimer.rounded()} ms.`);

      // Verify the number of operations does not exceed the maximum allowed limit.
      const protocol = getProtocol(resolvedTransaction.transactionTime);
      if (batchFile.operations.length > protocol.maxOperationsPerBatch) {
        throw Error(`Batch size of ${batchFile.operations.length} operations exceeds the allowed limit of ${protocol.maxOperationsPerBatch}.`);
      }

      endTimer = timeSpan();
      let operationIndex = 0;
      for (const encodedOperation of batchFile.operations) {
        const operationBuffer = Encoder.decodeAsBuffer(encodedOperation);

        // Verify size of each operation does not exceed the maximum allowed limit.
        if (operationBuffer.length > protocol.maxOperationByteSize) {
          throw Error(`Operation size of ${operationBuffer.length} bytes exceeds the allowed limit of ${protocol.maxOperationByteSize} bytes.`);
        }

        let operation;
        try {
          operation = Operation.create(operationBuffer, resolvedTransaction, operationIndex);
        } catch (error) {
          Logger.info(`Unable to create an operation with '${operationBuffer}': ${error}`);
          throw error;
        }

        operations.push(operation);
        operationIndex++;
      }
      Logger.info(`Decoded ${operations.length} operations in batch ${resolvedTransaction.batchFileHash}. Time taken: ${endTimer.rounded()} ms.`);

      // Ensure the batch meets proof-of-work requirements.
      this.verifyProofOfWork(operations);
    } catch {
      Logger.info(`Batch file '${resolvedTransaction.batchFileHash}' failed validation, transaction ignored.`);
      return; // Invalid batch file, nothing to process.
    }

    // If the code reaches here, it means that the batch of operations is valid, process each operations.
    const endTimer = timeSpan();
    for (const operation of operations) {
      await this.operationProcessor.process(operation);
    }
    Logger.info(`Processed batch ${resolvedTransaction.batchFileHash} containing ${operations.length} operations. Time taken: ${endTimer.rounded()} ms.`);
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
    Logger.info(`Best known valid recent transaction: ${bestKnownValidRecentTransactionNumber}`);

    // Revert all processed operations that came after the best known valid recent transaction.
    Logger.info('Reverting operations...');
    await this.operationProcessor.rollback(bestKnownValidRecentTransactionNumber);

    // NOTE: MUST do this step LAST to handle incomplete operation rollback due to unexpected scenarios, such as power outage etc.
    await this.transactionStore.removeTransactionsLaterThan(bestKnownValidRecentTransactionNumber);

    // Reset the in-memory last known good Tranaction so we next processing cycle will fetch from the correct timestamp/maker.
    this.lastKnownTransaction = bestKnownValidRecentTransaction;
  }

  /**
   * Verifies the given batch satisfies the proof-of-work requirements.
   * Throws error if fails proof-of-work requirements.
   */
  private verifyProofOfWork (_operations: Operation[]) {
    // TODO: https://github.com/decentralized-identity/sidetree-core/issues/25
  }
}

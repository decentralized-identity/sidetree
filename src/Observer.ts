import Encoder from './Encoder';
import Logger from './lib/Logger';
import timeSpan = require('time-span');
import Transaction, { ResolvedTransaction } from './Transaction';
import { Blockchain } from './Blockchain';
import { Cas } from './Cas';
import { ErrorCode, SidetreeError } from './Error';
import { getProtocol } from './Protocol';
import { InMemoryTransactionStore } from './TransactionStore';
import { Operation } from './Operation';
import { OperationProcessor } from './OperationProcessor';

/**
 * Class that performs periodic processing of batches of Sidetree operations anchored to the blockchain.
 */
export default class Observer {

  /**
   * Denotes if the periodic transaction processing should continue to occur.
   * Used mainly for test purposes.
   */
  private continuePeriodicProcessing = false;

  private transactionStore = new InMemoryTransactionStore();

  public constructor (
    private blockchain: Blockchain,
    private cas: Cas,
    private operationProcessor: OperationProcessor,
    private pollingIntervalInSeconds: number) {
  }

  /**
   * The function that starts the periodic polling and processing of Sidetree operations.
   */
  public startPeriodicProcessing () {
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
   * Processes new transactions if any,
   * then scehdules the next processing using the following rules unless `stopPeriodicProcessing()` is invoked:
   *   - If there are more pending transactions to process, schedules processing immediately;
   *   - Else wait for the next polling interval before processing again.
   */
  public async processTransactions () {
    let moreTransactions = false;

    try {
      // Get the last transaction to be used as a timestamp/watermark to fetch new transactions.
      const lastProcessedTransaction = await this.transactionStore.getLastTransaction();
      const lastProcessedTransactionNumber = lastProcessedTransaction ? lastProcessedTransaction.transactionNumber : undefined;
      const lastProcessedTransactionTimeHash = lastProcessedTransaction ? lastProcessedTransaction.transactionTimeHash : undefined;

      let readResult;
      let endTimer = timeSpan(); // Measure time taken to go blockchain read.
      try {
        Logger.info('Fetching Sidetree transactions from blockchain service...');
        readResult = await this.blockchain.read(lastProcessedTransactionNumber, lastProcessedTransactionTimeHash);
      } catch (error) {
        // If block reorganization (temporary fork) has happened.
        if (error instanceof SidetreeError && error.errorCode === ErrorCode.InvalidTransactionNumberOrTimeHash) {
          Logger.info(`Block reorganization detected, reverting transactions...`);
          await this.RevertInvalidTransactions();
          Logger.info(`Completed reverting invalid transactions.`);
          moreTransactions = true;
          return;
        } else {
          throw error;
        }
      }

      let transactions = readResult.transactions;
      moreTransactions = readResult.moreTransactions;

      Logger.info(`Fetched ${transactions.length} Sidetree transactions from blockchain service in ${endTimer.rounded()} ms.`);

      // Process each transaction sequentially.
      for (const transaction of transactions) {
        Logger.info(`Processing transaction ${transaction.transactionNumber}...`);
        await this.processTransaction(transaction);
        Logger.info(`Finished processing transaction ${transaction.transactionNumber}...`);
      }

      // Only continue to process unresolvable transactions if there are no more new transactions from blockchain to process.
      if (moreTransactions) {
        return;
      }

      endTimer = timeSpan();
      transactions = await this.transactionStore.getUnresolvableTransactionsToRetry();
      Logger.info(`Fetched ${transactions.length} unresolvable transactions to retry in ${endTimer.rounded()} ms.`);

      // Process each transaction sequentially.
      for (const transaction of transactions) {
        Logger.info(`Retrying processing of transaction ${transaction.transactionNumber}...`);
        await this.processTransaction(transaction);
        Logger.info(`Finished retrying processing of transaction ${transaction.transactionNumber}...`);
      }
    } catch (e) {
      Logger.error(`Encountered unhandled and possibly fatal Observer error, investigate and fix:`);
      Logger.error(e);
    } finally {
      if (moreTransactions) {
        setImmediate(async () => this.processTransactions());
      } else if (this.continuePeriodicProcessing) {
        Logger.info(`Waiting for ${this.pollingIntervalInSeconds} seconds before fetching and processing transactions again.`);
        setTimeout(async () => this.processTransactions(), this.pollingIntervalInSeconds * 1000);
      }

      Logger.info('End of processing new Sidetree transactions.');
    }
  }

  /**
   * Processes the given transaction.
   * If the given transaction is unresolvable (anchor/batch file not found), save the transaction for retry.
   * If no error encountered (unresolvable transaction is NOT an error), advance the 'last processed transaction' marker.
   */
  private async processTransaction (transaction: Transaction) {
    let errorOccurred = false;
    let transactionResolved = false;

    try {
      // Try fetching the anchor file.
      let anchorFileBuffer;
      try {
        anchorFileBuffer = await this.cas.read(transaction.anchorFileHash);
        Logger.info(`Downloaded anchor file '${transaction.anchorFileHash}' for transaction '${transaction.transactionNumber}'.`);
      } catch {
        // If unable to fetch the anchor file, place the transaction for future retries.
        Logger.info(`Failed downloading anchor file '${transaction.anchorFileHash}' for transaction '${transaction.transactionNumber}'.`);
        return;
      }

      let anchorFile;
      try {
        anchorFile = JSON.parse(anchorFileBuffer.toString());
      } catch {
        return; // Invalid transaction, no further processing necessary.
      }

      // Try fetching the batch file.
      let batchFileBuffer;
      try {
        batchFileBuffer = await this.cas.read(anchorFile.batchFileHash);
        Logger.info(`Downloaded batch file '${anchorFile.batchFileHash}' for transaction '${transaction.transactionNumber}'.`);
      } catch {
        // If unable to fetch the batch file, place the transaction for future retries.
        Logger.info(`Failed downloading batch file '${anchorFile.batchFileHash}' for transaction '${transaction.transactionNumber}'.`);
        return;
      }

      transactionResolved = true;

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
      errorOccurred = true;
      throw e;
    } finally {
      if (transactionResolved) {
        await this.transactionStore.removeUnresolvableTransaction(transaction);
      } else {
        await this.transactionStore.recordUnresolvableTransactionFetchAttempt(transaction);
      }

      // If no error occurred, we add the transaction to the list of processed transactions.
      // NOTE: unresolvable transaction is considered a processed transaction.
      if (!errorOccurred) {
        await this.transactionStore.addProcessedTransaction(transaction);
      }
    }
  }

  private async processResolvedTransaction (resolvedTransaction: ResolvedTransaction, batchFileBuffer: Buffer) {
    // Validate the batch file.
    const operations: Operation[] = [];
    try {
      const batchFile = JSON.parse(batchFileBuffer.toString());

      // Verify the number of operations does not exceed the maximum allowed limit.
      const protocol = getProtocol(resolvedTransaction.transactionTime);
      if (batchFile.operations.length > protocol.maxOperationsPerBatch) {
        throw Error(`Batch size of ${batchFile.operations.length} operations exceeds the allowed limit of ${protocol.maxOperationsPerBatch}.`);
      }

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

      // Ensure the batch meets proof-of-work requirements.
      this.verifyProofOfWork(operations);
    } catch {
      Logger.info(`Batch file '${resolvedTransaction.batchFileHash}' failed validation, transaction ignored.`);
      return; // Invalid batch file, nothing to process.
    }

    // If the code reaches here, it means that the batch of operations is valid, process each operations.
    const startTime = process.hrtime(); // For calcuating time taken to process operations.
    for (const operation of operations) {
      await this.operationProcessor.process(operation);
    }
    const duration = process.hrtime(startTime);
    Logger.info(`Processed a batch of ${operations.length} operations. Time taken: ${duration[0]} s ${duration[1] / 1000000} ms.`);
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
  }

  /**
   * Verifies the given batch satisfies the proof-of-work requirements.
   * Throws error if fails proof-of-work requirements.
   */
  private verifyProofOfWork (_operations: Operation[]) {
    // TODO: https://github.com/decentralized-identity/sidetree-core/issues/25
  }
}

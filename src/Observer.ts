import Encoder from './Encoder';
import Logger from './lib/Logger';
import Transaction, { ResolvedTransaction } from './Transaction';
import { Blockchain } from './Blockchain';
import { Cas } from './Cas';
import { getProtocol } from './Protocol';
import { OperationProcessor } from './OperationProcessor';
import { WriteOperation } from './Operation';

/**
 * Class that performs periodic processing of batches of Sidetree operations anchored to the blockchain.
 */
export default class Observer {

  /**
   * The number of seconds to wait before retry.
   * This value doubles for every consecutive processing failure.
   * The value is reset to 1 if batch processing is successful.
   */
  private errorRetryIntervalInSeconds = 1;

  /**
   * The last transaction that was completely processed.
   * This is mainly used as an offset marker to fetch new set of transactions.
   */
  private lastProcessedTransaction?: Transaction;

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
    setImmediate(async () => this.processTransactions(), this.pollingIntervalInSeconds * 1000);
  }

  /**
   * Processes new transactions, then scehdules the next processing:
   * If there are more transactions, schedules processing immediately.
   * If encountered error, then wait twice longer than the previous error retry interval before retry.
   * If everything is processed, will for the configured polling interval before processing again.
   */
  public async processTransactions () {
    Logger.info('Polling for new Sidetree transactions...');

    let unhandledErrorOccurred = false;
    let moreTransactions = false;

    try {
      // First check if there are resolved transactions that are previously unresolvable.
      // If there are, then process those first, then mark moreTransactions to true to process new transactions.
      let transactions = this.getNewlyResolvedTransactions();
      if (transactions) {
        moreTransactions = true;
      } else {
        // Get all the new transactions.
        const lastProcessedTransactionNumber = this.lastProcessedTransaction ?
          this.lastProcessedTransaction.transactionNumber : undefined;

        const lastProcessedTransactionTimeHash = this.lastProcessedTransaction ?
          this.lastProcessedTransaction.transactionTimeHash : undefined;

        Logger.info('Fetching Sidetree transactions from blockchain service...');
        const readResult = await this.blockchain.read(lastProcessedTransactionNumber, lastProcessedTransactionTimeHash);

        transactions = readResult.transactions;
        moreTransactions = readResult.moreTransactions;

        Logger.info(`Fetched ${transactions.length} Sidetree transactions from blockchain service.`);
      }

      // Process each transaction sequentially.
      for (const transaction of transactions) {
        Logger.info(`Processing transaction ${transaction.transactionNumber}...`);
        await this.processTransaction(transaction);

        // Resetting error retry back to 1 seconds if everytime we are able to process a transaction.
        // i.e. Transaction processing is not stalling.
        this.errorRetryIntervalInSeconds = 1;

        Logger.info(`Finished processing transaction ${transaction.transactionNumber}...`);
      }
    } catch (e) {
      unhandledErrorOccurred = true;
      this.errorRetryIntervalInSeconds *= 2;
      Logger.error(e);
      Logger.error(`Encountered Observer error, will attempt to process unprocessed operations again in ${this.errorRetryIntervalInSeconds} seconds.`);
    } finally {
      if (unhandledErrorOccurred) {
        setTimeout(async () => this.processTransactions(), this.errorRetryIntervalInSeconds * 1000);
      } else if (moreTransactions) {
        setImmediate(async () => this.processTransactions());
      } else {
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

    try {
      // Try fetching the anchor file.
      let anchorFileBuffer;
      try {
        anchorFileBuffer = await this.cas.read(transaction.anchorFileHash);
      } catch {
        // If unable to fetch the anchor file, place the transaction for future retries.
        this.addUnresolvableTransaction(transaction);
        return;
      }

      let anchorFile;
      try {
        anchorFile = JSON.parse(anchorFileBuffer.toString());

        // TODO: validate anchor file schema.
      } catch {
        return; // Invalid transaction, no further processing necessary.
      }

      // Try fetching the batch file.
      let batchFileBuffer;
      try {
        batchFileBuffer = await this.cas.read(anchorFile.batchFileHash);
        // TODO: Consider short-circuit optimization: check file size before downloading.
      } catch {
        // If unable to fetch the batch file, place the transaction for future retries.
        this.addUnresolvableTransaction(transaction);
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
      errorOccurred = true;
      throw e;
    } finally {
      // If no error occurred, we increment the last proccessed transaction marker.
      // NOTE: unresolvable transaction is considered a processed transaction.
      if (!errorOccurred) {
        this.lastProcessedTransaction = transaction;
      }
    }
  }

  private async processResolvedTransaction (resolvedTransaction: ResolvedTransaction, batchFileBuffer: Buffer) {
    // Validate the batch file.
    const operations: WriteOperation[] = [];
    try {
      const batchFile = JSON.parse(batchFileBuffer.toString());

      // TODO: validate batch file JSON schema.

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

        const operation = WriteOperation.create(operationBuffer, resolvedTransaction, operationIndex);

        operations.push(operation);
        operationIndex++;
      }

      // Ensure the batch meets proof-of-work requirements.
      this.verifyProofOfWork(operations);
    } catch {
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
   * Adds the given transaction to the list of unresolvable trasactions for future retries.
   */
  private addUnresolvableTransaction (_transaction: Transaction) {
    // TODO
  }

  /**
   * Gets resolved transations that are previously not resolvable (i.e. unable to download anchor or batch file).
   */
  private getNewlyResolvedTransactions (): Transaction[] | undefined {
    // TODO
    return;
  }

  /**
   * Verifies the given batch satisfies the proof-of-work requirements.
   * Throws error if fails proof-of-work requirements.
   */
  private verifyProofOfWork (_operations: WriteOperation[]) {
    // TODO
  }
}

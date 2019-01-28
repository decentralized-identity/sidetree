import Encoder from './Encoder';
import Logger from './lib/Logger';
import Transaction, { ResolvedTransaction } from './Transaction';
import { Blockchain } from './Blockchain';
import { Cas } from './Cas';
import { ErrorCode, SidetreeError } from './Error';
import { getProtocol } from './Protocol';
import { OperationProcessor } from './OperationProcessor';
import { WriteOperation } from './Operation';

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
   * List of processed Sidetree transactions.
   */
  private processedTransactions: Transaction[] = [];

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
    return this.processedTransactions;
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
      // First check if there are resolved transactions that are previously unresolvable.
      // If there are, then process those first, then mark moreTransactions to true to process new transactions.
      let transactions = this.getNewlyResolvedTransactions();
      if (transactions) {
        moreTransactions = true;
      } else {
        // Get all the new transactions.
        const lastProcessedTransactionIndex = this.processedTransactions.length - 1;
        const lastProcessedTransaction = this.processedTransactions[lastProcessedTransactionIndex];
        const lastProcessedTransactionNumber = lastProcessedTransaction ? lastProcessedTransaction.transactionNumber : undefined;
        const lastProcessedTransactionTimeHash = lastProcessedTransaction ? lastProcessedTransaction.transactionTimeHash : undefined;

        let readResult;
        try {
          Logger.info('Fetching Sidetree transactions from blockchain service...');
          readResult = await this.blockchain.read(lastProcessedTransactionNumber, lastProcessedTransactionTimeHash);
        } catch (error) {
          // If block reorganization (temporary fork) has happened.
          if (error instanceof SidetreeError && error.errorCode === ErrorCode.InvalidTransactionNumberOrTimeHash) {
            Logger.info(`Block reorganization detected, reverting transactions...`);
            await this.detectAndRevertInvalidTransactions();
            Logger.info(`Completed reverting invalide transactions.`);
            moreTransactions = true;
            return;
          } else {
            throw error;
          }
        }

        transactions = readResult.transactions;
        moreTransactions = readResult.moreTransactions;

        Logger.info(`Fetched ${transactions.length} Sidetree transactions from blockchain service.`);
      }

      // Process each transaction sequentially.
      for (const transaction of transactions) {
        Logger.info(`Processing transaction ${transaction.transactionNumber}...`);
        await this.processTransaction(transaction);
        Logger.info(`Finished processing transaction ${transaction.transactionNumber}...`);
      }
    } catch (e) {
      Logger.error(`Encountered unhandled Observer error, investigate and fix:`);
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

    try {
      // Try fetching the anchor file.
      let anchorFileBuffer;
      try {
        anchorFileBuffer = await this.cas.read(transaction.anchorFileHash);
      } catch {
        // If unable to fetch the anchor file, place the transaction for future retries.
        this.addUnresolvableTransaction(transaction);
        Logger.info(`Failed downloading anchor file '${transaction.anchorFileHash}' for transaction '${transaction.transactionNumber}'.`);
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
        Logger.info(`Failed downloading batch file '${anchorFile.batchFileHash}' for transaction '${transaction.transactionNumber}'.`);
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
      // If no error occurred, we add the transaction to the list of processed transactions.
      // NOTE: unresolvable transaction is considered a processed transaction.
      if (!errorOccurred) {
        this.processedTransactions.push(transaction);
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
   * Detects and reverts invalid transactions. Used in the event of a block-reorganization.
   */
  private async detectAndRevertInvalidTransactions () {
    // Compute a list of exponentially-spaced transactions with their index, starting from the last transaction of the processed transactions.
    const exponentiallySpacedTransactions: { transaction: Transaction, index: number }[] = [];
    let index = this.processResolvedTransaction.length - 1;
    let distance = 1;
    while (index >= 0) {
      exponentiallySpacedTransactions.push({ transaction: this.processedTransactions[index], index: index });
      index -= distance;
      distance *= 2;
    }

    // Find a known valid Sidetree transaction that is prior to the block reorganization.
    const bestKnownValidRecentTransaction
      = await this.blockchain.getFirstValidTransaction(exponentiallySpacedTransactions.map(value => value.transaction));

    Logger.info(`Best known valid recent transaction: ${bestKnownValidRecentTransaction ? bestKnownValidRecentTransaction.transactionNumber : 'none'}`);

    // If we found a known valid transaciton, get the index of that transation in the list of processed transactions.
    let bestKnownValidRecentTransactionIndex = -1;
    if (bestKnownValidRecentTransaction) {
      for (let i = 0; i < exponentiallySpacedTransactions.length; i++) {
        if (exponentiallySpacedTransactions[i].transaction.transactionNumber === bestKnownValidRecentTransaction.transactionNumber) {
          bestKnownValidRecentTransactionIndex = exponentiallySpacedTransactions[i].index;
          break;
        }
      }
    }

    // Revert all processed transactions that came after the best known valid recent transaction.
    Logger.info(`Reverting ${this.processedTransactions.length - bestKnownValidRecentTransactionIndex - 1} transactions...`);
    this.processedTransactions.splice(bestKnownValidRecentTransactionIndex + 1);

    // Revert all processed operations that came after the best known valid recent transaction.
    Logger.info('Reverting operations...');
    this.operationProcessor.rollback(bestKnownValidRecentTransaction === undefined ? undefined : bestKnownValidRecentTransaction.transactionNumber);
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

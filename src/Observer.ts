import * as Base58 from 'bs58';
import Protocol from './Protocol';
import Transaction from './Transaction';
import { Blockchain } from './Blockchain';
import { Cas } from './Cas';
import { DidCache } from './DidCache';
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

  public constructor (
    private blockchain: Blockchain,
    private cas: Cas,
    private didCache: DidCache,
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
    let unhandledErrorOccurred = false;
    let moreTransactions = false;

    try {
      // First check if there are resolved transactions that are previously unresolvable.
      // If there are, then process those first, then mark moreTransactions to true to process new transactions.
      let transactions = this.getResolvedTransactions();
      if (transactions) {
        moreTransactions = true;
      } else {
        // Get all the new transactions.
        const lastProcessedTransactionNumber = this.didCache.lastProcessedTransaction ? this.didCache.lastProcessedTransaction.transactionNumber : undefined;
        const readResult = await this.blockchain.read(lastProcessedTransactionNumber);
        transactions = readResult.transactions;
        moreTransactions = readResult.moreTransactions;
      }

      // Process each transaction sequentially.
      for (const transaction of transactions) {
        // Try fetching the anchor file.
        let anchorFileBuffer;
        try {
          anchorFileBuffer = await this.cas.read(transaction.anchorFileHash);
        } catch {
          // If unable to fetch the anchor file, place the transaction for future retries.
          this.addUnresolvableTransaction(transaction);
          continue; // Process next transaction.
        }

        let anchorFile;
        try {
          anchorFile = JSON.parse(anchorFileBuffer.toString());

          // TODO: validate anchor file schema.
        } catch {
          continue; // Invalid transaction, process next transaction.
        }

        // Try fetching the batch file.
        let batchFileBuffer;
        try {
          batchFileBuffer = await this.cas.read(anchorFile.batchFileHash);
          // TODO: Consider short-circuit optimization: check file size before downloading.
        } catch {
          // If unable to fetch the batch file, place the transaction for future retries.
          this.addUnresolvableTransaction(transaction);
          continue; // Process next transaction.
        }

        await this.processOperationBatch(transaction, batchFileBuffer);

        this.errorRetryIntervalInSeconds = 1;
      }
    } catch (e) {
      unhandledErrorOccurred = true;
      this.errorRetryIntervalInSeconds *= 2;
      console.info(e);
      console.info(`Encountered Observer error, will attempt to process unprocessed operations again in ${this.errorRetryIntervalInSeconds} seconds.`);
    } finally {
      if (unhandledErrorOccurred) {
        setTimeout(async () => this.processTransactions(), this.errorRetryIntervalInSeconds * 1000);
      } else if (moreTransactions) {
        setImmediate(async () => this.processTransactions());
      } else {
        setTimeout(async () => this.processTransactions(), this.pollingIntervalInSeconds * 1000);
      }
    }
  }

  private async processOperationBatch (transaction: Transaction, batchFileBuffer: Buffer) {
    // Validate the batch file.
    const operations: WriteOperation[] = [];
    try {
      const batchFile = JSON.parse(batchFileBuffer.toString());

      // TODO: validate batch file JSON schema.

      // Verify the number of operations does not exceed the maximum allowed limit.
      if (batchFile.operations.length > Protocol.maxOperationsPerBatch) {
        throw Error(`Batch size of ${batchFile.operations.length} operations exceeds the allowed limit of ${Protocol.maxOperationsPerBatch}.`);
      }

      let operationIndex = 0;
      for (const operationBase58 of batchFile.operations) {
        const operationBuffer = Buffer.from(Base58.decode(operationBase58));

        // Verify size of each operation does not exceed the maximum allowed limit.
        if (operationBuffer.length > Protocol.maxOperationByteSize) {
          throw Error(`Operation size of ${operationBuffer.length} bytes exceeds the allowed limit of ${Protocol.maxOperationByteSize} bytes.`);
        }

        const operation = WriteOperation.create(operationBuffer, transaction.transactionNumber, operationIndex);

        operations.push(operation);
      }

      // Ensure the batch meets proof-of-work requirements.
      this.verifyProofOfWork(operations);
    } catch {
      return; // Invalid batch file, nothing to process.
    }

    // If the code reaches here, it means that the batch of operations is valid, apply each operations.
    for (const operation of operations) {
      this.didCache.apply(operation);
    }
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
  private getResolvedTransactions (): Transaction[] | undefined {
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

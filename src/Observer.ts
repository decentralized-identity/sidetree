import * as Base58 from 'bs58';
import Transaction from './Transaction';
import { Blockchain } from './Blockchain';
import { Cas } from './Cas';
import { DidCache } from './DidCache';
import { WriteOperation } from './Operation';

/**
 * Class that performs periodic processing of batches of Sidetree operations anchored to the blockchain.
 */
export default class Observer {
  public constructor (
    private blockchain: Blockchain,
    private cas: Cas,
    private didCache: DidCache,
    private pollingIntervalInSeconds: number,
    startPeriodicPolling: boolean = true) {

    if (startPeriodicPolling) {
      this.startPeriodicPolling();
    }
  }

  /**
   * The function that starts the periodic polling and processing of Sidetree operations.
   */
  public startPeriodicPolling () {
    setInterval(async () => this.processTransactions(), this.pollingIntervalInSeconds * 1000);
  }

  /**
   * Processes all new operations anchored on blockchain.
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
        } catch {
          // If unable to fetch the batch file, place the transaction for future retries.
          this.addUnresolvableTransaction(transaction);
          continue; // Process next transaction.
        }

        await this.processOperationBatch(transaction, batchFileBuffer);
      }
    } catch (e) {
      unhandledErrorOccurred = true;
      console.info(e);
      console.info('Encountered Observer error, will attempt to process unprocessed operations again.');
    } finally {
      if (unhandledErrorOccurred || moreTransactions) {
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

      let operationIndex = 0;
      for (const operationBase58 of batchFile.operations) {
        const operationBuffer = Buffer.from(Base58.decode(operationBase58));
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

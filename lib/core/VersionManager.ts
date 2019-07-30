import TransactionProcessor from './interfaces/TransactionProcessor';
import DownloadManager from './DownloadManager';
import OperationStore from './interfaces/OperationStore';

/**
 * The classes that handels the loading of different versions of protocol codebase.
 */
export default class VersionManager {
  public constructor (private downloadManager: DownloadManager, private operationStore: OperationStore) {}

  /**
   * Gets the corresponding version of the `TransactionProcessor` based on the transaction time.
   */
  public async getTransactionProcessor (_transactionTime: number): Promise<TransactionProcessor> {
    // Remove hardcode.
    const version = 'latest';

    const transactionProcessorClass = (await import(`./versions/${version}/TransactionProcessor`)).default;
    return new transactionProcessorClass(this.downloadManager, this.operationStore);
  }
}

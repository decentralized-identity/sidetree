import DownloadManager from '../../../../lib/core/DownloadManager';
import IOperationStore from '../../../../lib/core/interfaces/IOperationStore';

/**
 * Transaction processor.
 */
export default class TransactionProcessor {

  public constructor (private downloadManager: DownloadManager, private operationStore: IOperationStore) {
    console.debug(this.downloadManager, this.operationStore);
  }
}

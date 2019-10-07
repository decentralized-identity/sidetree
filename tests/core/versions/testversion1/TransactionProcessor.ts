import DownloadManager from '../../../../lib/core/DownloadManager';
import TransactionModel from '../../../../lib/common/models/TransactionModel';
import IOperationStore from '../../../../lib/core/interfaces/IOperationStore';
import ITransactionProcessor from '../../../../lib/core/interfaces/ITransactionProcessor';

/**
 * Transaction processor.
 */
export default class TransactionProcessor implements ITransactionProcessor {

  public constructor (private downloadManager: DownloadManager, private operationStore: IOperationStore) {
    console.debug(this.downloadManager, this.operationStore);
  }

  async processTransaction (transaction: TransactionModel): Promise<boolean> {
    throw new Error(`TransactionProcessor: Not implemented. Version: TestVersion1. Inputs: ${transaction}`);
  }
}

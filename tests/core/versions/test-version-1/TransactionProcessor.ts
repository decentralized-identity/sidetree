import DownloadManager from '../../../../lib/core/DownloadManager';
import IBlockchain from '../../../../lib/core/interfaces/IBlockchain';
import IOperationStore from '../../../../lib/core/interfaces/IOperationStore';
import ITransactionProcessor from '../../../../lib/core/interfaces/ITransactionProcessor';
import IVersionMetadataFetcher from '../../../../lib/core/interfaces/IVersionMetadataFetcher';
import TransactionModel from '../../../../lib/common/models/TransactionModel';

/**
 * Transaction processor.
 */
export default class TransactionProcessor implements ITransactionProcessor {

  public constructor (
    private downloadManager: DownloadManager,
    private operationStore: IOperationStore,
    private blockchain: IBlockchain,
    private versionMetadataFetcher: IVersionMetadataFetcher) {
    console.info(this.downloadManager, this.operationStore, this.blockchain, this.versionMetadataFetcher);
  }

  async processTransaction (transaction: TransactionModel): Promise<boolean> {
    throw new Error(`TransactionProcessor: Not implemented. Version: TestVersion1. Inputs: ${transaction}`);
  }
}

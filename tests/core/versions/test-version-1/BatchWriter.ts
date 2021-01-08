import IBatchWriter from '../../../../lib/core/interfaces/IBatchWriter';
import IBlockchain from '../../../../lib/core/interfaces/IBlockchain';
import ICas from '../../../../lib/core/interfaces/ICas';
import IOperationQueue from '../../../../lib/core/versions/latest/interfaces/IOperationQueue';
import IVersionMetadataFetcher from '../../../../lib/core/interfaces/IVersionMetadataFetcher';

/**
 * Batch writer.
 */
export default class BatchWriter implements IBatchWriter {

  public constructor (
    private operationQueue: IOperationQueue,
    private blockchain: IBlockchain,
    private cas: ICas,
    private versionMetadataFetcher: IVersionMetadataFetcher) {
    console.info(this.operationQueue, this.blockchain, this.cas, this.versionMetadataFetcher);
  }

  async write (): Promise<number> {
    throw new Error('BatchWriter: Not implemented. Version: TestVersion1');
  }
}

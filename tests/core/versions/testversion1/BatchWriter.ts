import IBlockchain from '../../../../lib/core/interfaces/IBlockchain';
import ICas from '../../../../lib/core/interfaces/ICas';
import IOperationQueue from '../../../../lib/core/versions/latest/interfaces/IOperationQueue';

/**
 * Batch writer.
 */
export default class BatchWriter {

  public constructor (private operationQueue: IOperationQueue, private blockchain: IBlockchain, private cas: ICas) {
    console.debug(this.operationQueue, this.blockchain, this.cas);
  }
}

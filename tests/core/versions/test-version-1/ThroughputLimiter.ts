import IThroughputLimiter from '../../../../lib/core/interfaces/IThroughputLimiter';
import TransactionModel from '../../../../lib/common/models/TransactionModel';

/**
 * test version of throughput limiter
 */
export default class ThroughputLimiter implements IThroughputLimiter {

  public selectQualifiedTransactions (_transactions: TransactionModel[]): Promise<TransactionModel[]> {
    return new Promise((resolve) => { resolve([]); });
  }
}

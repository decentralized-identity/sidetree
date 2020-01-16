import IThroughputLimiter from '../../interfaces/IThroughputLimiter';
import TransactionModel from '../../../common/models/TransactionModel';

/**
 * dummy throughput limiter
 */
export default class ThroughputLimiter implements IThroughputLimiter {

  /**
   * Return what is passed in
   */
  selectQualifiedTransactions (orderedTransactions: TransactionModel[]): Promise<TransactionModel[]> {
    return new Promise((resolve) => { resolve(orderedTransactions); });
  }
}

import ITransactionSelector from '../../interfaces/ITransactionSelector';
import TransactionModel from '../../../common/models/TransactionModel';

/**
 * dummy transaction selector
 */
export default class TransactionSelector implements ITransactionSelector {

  /**
   * Return what is passed in
   */
  selectQualifiedTransactions (transactions: TransactionModel[]): Promise<TransactionModel[]> {
    return new Promise((resolve) => { resolve(transactions); });
  }
}

import BlockchainTimeModel from '../models/BlockchainTimeModel';
import TransactionModel from '../../common/models/TransactionModel';

/**
 * Interface to access the underlying blockchain.
 * This interface is mainly useful for creating a mock Blockchain for testing purposes.
 */
export default interface IBlockchain {
  /**
   * Writes a Sidtree transaction with the given anchor string to blockchain.
   */
  write (anchorString: string): Promise<void>;
  /**
   * Gets Sidetree transactions in chronological order.
   * The function call may not return all known transactions, moreTransaction indicates if there are more transactions to be fetched.
   * When sinceTransactionNumber is not given, Sidetree transactions starting from inception will be returned.
   * When sinceTransactionNumber is given, only Sidetree transaction after the given transaction will be returned.
   * @param sinceTransactionNumber A valid Sidetree transaction number.
   * @param transactionTimeHash The hash associated with the anchored time of the transaction number given.
   *                            Required if and only if sinceTransactionNumber is provided.
   * @throws SidetreeError with ErrorCode.InvalidTransactionNumberOrTimeHash if a potential block reorganization is detected.
   */
  read (sinceTransactionNumber?: number, transactionTimeHash?: string): Promise<{
    moreTransactions: boolean;
    transactions: TransactionModel[];
  }>;
  /**
   * Given a list of Sidetree transaction in any order, iterate through the list and return the first transaction that is valid.
   * @param transactions List of potentially valid transactions.
   */
  getFirstValidTransaction (transactions: TransactionModel[]): Promise<TransactionModel | undefined>;
  /**
   * Gets the approximate latest time synchronously without requiring to make network call.
   * Useful for cases where high performance is desired and hgih accuracy is not required.
   */
  approximateTime: BlockchainTimeModel;
}

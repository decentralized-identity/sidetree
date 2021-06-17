import BlockchainTimeModel from '../models/BlockchainTimeModel';
import TransactionModel from '../../common/models/TransactionModel';
import ValueTimeLockModel from '../../common/models/ValueTimeLockModel';

/**
 * Interface to access the underlying blockchain.
 * This interface is mainly useful for creating a mock Blockchain for testing purposes.
 */
export default interface IBlockchain {
  /**
   * Writes a Sidetree transaction with the given anchor string to blockchain.
   * @param anchorString Data to write to the blockchain.
   * @param fee Fee for the current transaction.
   */
  write (anchorString: string, fee: number): Promise<void>;

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
   * Returns the latest blockchain time
   */
  getLatestTime (): Promise<BlockchainTimeModel>;

  /**
   * Fetches the normalized transaction fee used for proof-of-fee calculation, given the blockchain time.
   * @param transactionTime A valid Sidetree transaction time.
   *
   * @throws SidetreeError with ErrorCode.BlockchainTimeOutOfRange if the input transaction transactionTime is less
   * than Sidetree genesis blockchain time or is later than the current blockchain time.
   */
  getFee (transactionTime: number): Promise<number>;

  /**
   * Gets the lock object associated with the given lock identifier.
   *
   * @param lockIdentifier The identifier of the desired lock.
   * @returns the lock object if found; undefined otherwise.
   */
  getValueTimeLock (lockIdentifier: string): Promise<ValueTimeLockModel | undefined>;

  /**
   * Gets the lock object required for batch writing.
   *
   * @returns the lock object if one exist; undefined otherwise.
   * @throws SidetreeError with ErrorCode.ValueTimeLockInPendingState if the lock is not yet confirmed on the blockchain.
   */
  getWriterValueTimeLock (): Promise<ValueTimeLockModel | undefined>;
}

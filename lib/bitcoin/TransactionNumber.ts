import ErrorCode from './ErrorCode';
import SidetreeError from '../common/SidetreeError';

/**
 * Defines the TransactionNumber as a combination of block number and transaction index within the block.
 */
export default class TransactionNumber {

  /**
   * Maximum allowed transaction index in a block.
   */
  private static readonly maxTransactionIndexInBlock = 999999;

  /**
   * Maximum allowed transaction count in a block.
   */
  private static readonly maxTransactionCountInBlock = TransactionNumber.maxTransactionIndexInBlock + 1; // 1,000,000

  /**
   * Constructs the transaction number given the block number and the transaction index in the block.
   */
  public static construct (blockNumber: number, transactionIndexInBlock: number) {
    // NOTE: JavaScript can have 53 bit integer before starting to loose precision: 2 ^ 53 = 9,007,199,254,740,992.
    // We allocate first 6 digits for transaction index within a block, and rest of the digits for block number.

    if (transactionIndexInBlock > TransactionNumber.maxTransactionIndexInBlock) {
      throw new SidetreeError(
        ErrorCode.TransactionNumberTransactionIndexInBlockTooLarge,
        `Position index ${transactionIndexInBlock} given exceeds max allowed value of ${TransactionNumber.maxTransactionIndexInBlock}`
      );
    }

    // Choosing a nice round number as long as it is less than `9007199254`.
    const maxBlockNumber = 9000000000;
    if (blockNumber > maxBlockNumber) {
      throw new SidetreeError(
        ErrorCode.TransactionNumberBlockNumberTooLarge,
        `Block number ${blockNumber} given exceeds max allowed value of ${maxBlockNumber}`
      );
    }

    const transactionNumber = TransactionNumber.privateConstruct(blockNumber, transactionIndexInBlock);
    return transactionNumber;
  }

  /**
   * Internal construction method that assumes inputs are valid/validated.
   */
  private static privateConstruct (blockNumber: number, transactionIndexInBlock: number) {
    const transactionNumber = blockNumber * TransactionNumber.maxTransactionCountInBlock + transactionIndexInBlock;
    return transactionNumber;
  }

  /**
   * Constructs the transaction number of the last possible transaction of the specified block.
   */
  public static lastTransactionOfBlock (blockNumber: number) {
    return TransactionNumber.privateConstruct(blockNumber, TransactionNumber.maxTransactionIndexInBlock);
  }

  /**
   * Returns the block number component of transactionNumber
   */
  public static getBlockNumber (transactionNumber: number) {
    const blockNumber = Math.trunc(transactionNumber / TransactionNumber.maxTransactionCountInBlock);
    return blockNumber;
  }
}

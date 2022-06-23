import BitcoinTransactionModel from './BitcoinTransactionModel';

/**
 * Encapsulates the block data returned by the bitcoin service or block parsed directly from file.
 */
export default interface BitcoinBlockModel {
  hash: string;
  height: number;
  previousHash: string;
  transactions: BitcoinTransactionModel[];
}

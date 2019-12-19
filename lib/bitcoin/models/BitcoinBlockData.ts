import BitcoinTransactionModel from './BitcoinTransactionModel';

/**
 * Encapsulates the block data returned by the bitcoin service.
 */
export default interface BitcoinBlockData {
  hash: string;
  height: number;
  transactions: BitcoinTransactionModel[];
}

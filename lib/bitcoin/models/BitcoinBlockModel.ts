import BitcoinTransactionModel from './BitcoinTransactionModel';

/**
 * Encapsulates the block data returned by the bitcoin service.
 */
export default interface BitcoinBlockModel {
  hash: string;
  height: number;
  previousHash: string;
  transactions: BitcoinTransactionModel[];
}

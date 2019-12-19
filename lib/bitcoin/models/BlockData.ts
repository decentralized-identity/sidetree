import { Transaction } from 'bitcore-lib';

/**
 * Encapsulates the block data returned by the bitcoin service.
 */
export default interface BlockData {
  hash: string;
  height: number;
  previousHash: string;
  transactions: Transaction[];
}

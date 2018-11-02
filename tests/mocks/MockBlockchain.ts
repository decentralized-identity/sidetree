import Block from '../../src/Block';
import Transaction from '../../src/Transaction';
import { Blockchain } from '../../src/Blockchain';

/**
 * Mock Blockchain class for testing.
 */
export default class MockBlockchain implements Blockchain {
  /** Stores each hash given in write() method. */
  hashes: string[] = [];

  public async write (anchorFileHash: string): Promise<void> {
    this.hashes.push(anchorFileHash);
  }

  public async read (afterTransaction?: number): Promise<{ moreTransactions: boolean, transactions: Transaction[] }> {
    if (afterTransaction === undefined) {
      afterTransaction = -1;
    }

    let moreTransactions = false;
    if (this.hashes.length > 0 &&
      afterTransaction < this.hashes.length - 2) {
      moreTransactions = true;
    }

    const transactions: Transaction[] = [];
    if (this.hashes.length > 0 &&
      afterTransaction < this.hashes.length - 1) {
      const hashIndex = afterTransaction + 1;
      const transaction = {
        blockNumber: hashIndex,
        transactionNumber: hashIndex,
        anchorFileHash: this.hashes[hashIndex]
      };
      transactions.push(transaction);
    }

    return {
      moreTransactions: moreTransactions,
      transactions: transactions
    };
  }

  private lastBlock?: Block = { blockNumber: 500000, blockHash: 'dummyHash' };
  public async getLastBlock (): Promise<Block> {
    return this.lastBlock!;
  }

  /**
   * Sets the last block to be returned by the getLastBlock() call.
   */
  public setLaskBlock (block: Block) {
    this.lastBlock = block;
  }
}

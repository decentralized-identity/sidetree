import BlockchainTime from '../../src/BlockchainTime';
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

  private latestTime?: BlockchainTime = { time: 500000, hash: 'dummyHash' };
  public async getLatestTime (): Promise<BlockchainTime> {
    return this.latestTime!;
  }

  /**
   * Hardcodes the latest time to be returned.
   */
  public setLatestTime (time: BlockchainTime) {
    this.latestTime = time;
  }
}

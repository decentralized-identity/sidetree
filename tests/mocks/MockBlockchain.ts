import IBlockchainTime from '../../lib/core/BlockchainTime';
import { ITransaction } from '../../lib/core/Transaction';
import { Blockchain } from '../../lib/core/Blockchain';

/**
 * Mock Blockchain class for testing.
 */
export default class MockBlockchain implements Blockchain {
  /** Stores each hash given in write() method. */
  hashes: string[] = [];

  public async write (anchorFileHash: string): Promise<void> {
    this.hashes.push(anchorFileHash);
  }

  public async read (sinceTransactionNumber?: number, _transactionTimeHash?: string): Promise<{ moreTransactions: boolean, transactions: ITransaction[] }> {
    if (sinceTransactionNumber === undefined) {
      sinceTransactionNumber = -1;
    }

    let moreTransactions = false;
    if (this.hashes.length > 0 &&
      sinceTransactionNumber < this.hashes.length - 2) {
      moreTransactions = true;
    }

    const transactions: ITransaction[] = [];
    if (this.hashes.length > 0 &&
      sinceTransactionNumber < this.hashes.length - 1) {
      const hashIndex = sinceTransactionNumber + 1;
      const transaction = {
        transactionNumber: hashIndex,
        transactionTime: hashIndex,
        transactionTimeHash: this.hashes[hashIndex],
        anchorFileHash: this.hashes[hashIndex]
      };
      transactions.push(transaction);
    }

    return {
      moreTransactions: moreTransactions,
      transactions: transactions
    };
  }

  public async getFirstValidTransaction (_transactions: ITransaction[]): Promise<ITransaction | undefined> {
    return undefined;
  }

  private latestTime?: IBlockchainTime = { time: 500000, hash: 'dummyHash' };
  public async getLatestTime (): Promise<IBlockchainTime> {
    return this.latestTime!;
  }

  /**
   * Hardcodes the latest time to be returned.
   */
  public setLatestTime (time: IBlockchainTime) {
    this.latestTime = time;
  }
}

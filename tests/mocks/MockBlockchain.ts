import BlockchainTimeModel from '../../lib/core/models/BlockchainTimeModel';
import IBlockchain from '../../lib/core/interfaces/IBlockchain';
import TransactionModel from '../../lib/common/models/TransactionModel';
import ValueTimeLockModel from '../../lib/common/models/ValueTimeLockModel';

/**
 * Mock Blockchain class for testing.
 */
export default class MockBlockchain implements IBlockchain {
  /** Stores each hash & fee given in write() method. */
  hashes: [string, number][] = [];

  public async write (anchorString: string, fee: number): Promise<void> {
    this.hashes.push([anchorString, fee]);
  }

  public async read (sinceTransactionNumber?: number, _transactionTimeHash?: string): Promise<{ moreTransactions: boolean, transactions: TransactionModel[] }> {
    if (sinceTransactionNumber === undefined) {
      sinceTransactionNumber = -1;
    }

    let moreTransactions = false;
    if (this.hashes.length > 0 &&
      sinceTransactionNumber < this.hashes.length - 2) {
      moreTransactions = true;
    }

    const transactions: TransactionModel[] = [];
    if (this.hashes.length > 0 &&
      sinceTransactionNumber < this.hashes.length - 1) {
      const hashIndex = sinceTransactionNumber + 1;
      const transaction = {
        transactionNumber: hashIndex,
        transactionTime: hashIndex,
        transactionTimeHash: this.hashes[hashIndex][0],
        anchorString: this.hashes[hashIndex][0],
        transactionFeePaid: this.hashes[hashIndex][1],
        normalizedTransactionFee: this.hashes[hashIndex][1],
        writer: 'writer'
      };
      transactions.push(transaction);
    }

    return {
      moreTransactions: moreTransactions,
      transactions: transactions
    };
  }

  public async getFirstValidTransaction (_transactions: TransactionModel[]): Promise<TransactionModel | undefined> {
    return undefined;
  }

  private latestTime?: BlockchainTimeModel = { time: 500000, hash: 'dummyHash' };

  public getLatestTime (): Promise<BlockchainTimeModel> {
    return new Promise((resolve) => { resolve(this.latestTime!); });
  }

  /**
   * Hardcodes the latest time to be returned.
   */
  public setLatestTime (time: BlockchainTimeModel) {
    this.latestTime = time;
  }

  public async getFee (transactionTime: number): Promise<number> {
    throw Error('getFee() not implemented. Inputs: ' + transactionTime);
  }

  public async getValueTimeLock (_lockIdentifer: string): Promise<ValueTimeLockModel | undefined> {
    throw Error('getValueTimeLock() Not implemented.');
  }

  public async getWriterValueTimeLock (): Promise<ValueTimeLockModel | undefined> {
    throw Error('getWriterValueTimeLock() not implemented.');
  }
}

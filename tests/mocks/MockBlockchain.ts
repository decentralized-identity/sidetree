import Transaction from '../../src/Transaction';
import { Blockchain } from '../../src/Blockchain';

export default class MockBlockchain implements Blockchain {
  public async write (_anchorFileHash: string): Promise<void> {
  }

  public async read (_afterTransaction?: number): Promise<{ moreTransactions: boolean, transactions: Transaction[] }> {
    return {
      moreTransactions: false,
      transactions: []
    }
  }
}
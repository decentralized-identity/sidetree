import Block from '../../src/Block';
import Transaction from '../../src/Transaction';
import { Blockchain } from '../../src/Blockchain';

/**
 * Mock Blockchain class for testing.
 */
export default class MockBlockchain implements Blockchain {
  public async write (_anchorFileHash: string): Promise<void> {
    return;
  }

  public async read (_afterTransaction?: number): Promise<{ moreTransactions: boolean, transactions: Transaction[] }> {
    return {
      moreTransactions: false,
      transactions: []
    };
  }

  private lastBlock?: Block;
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

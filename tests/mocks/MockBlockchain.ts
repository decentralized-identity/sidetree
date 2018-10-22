import Block from '../../src/Block';
import { Blockchain } from '../../src/Blockchain';

export default class MockBlockchain implements Blockchain {
  public async write (_anchorFileHash: string): Promise<void> {
  }

  private lastBlock?: Block;
  public async getLastBlock (): Promise<Block> {
    return this.lastBlock!;
  }
  public setLaskBlock (block: Block) {
    this.lastBlock = block;
  }
}

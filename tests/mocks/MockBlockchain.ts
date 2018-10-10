import { Blockchain } from '../../src/Blockchain';

export default class MockBlockchain implements Blockchain {
  public async write (_anchorFileHash: string): Promise<void> {
  }
}
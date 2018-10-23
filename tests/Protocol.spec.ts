import { getProtocol } from '../src/Protocol';

describe('Protocol', () => {  

  it('should fetch right protocol given the block number.', async () => {
    const protocol0_1 = getProtocol(1);
    expect(protocol0_1.startingBlockNumber).toBe(0);

    const protocol1_0 = getProtocol(500000);
    expect(protocol1_0.startingBlockNumber).toBe(500000);
  });
});

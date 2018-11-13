import { getProtocol, initializeProtocol } from '../src/Protocol';

describe('Protocol', () => {
  initializeProtocol('protocol-test.json');

  it('should fetch right protocol given the block number.', async () => {
    const protocol01 = getProtocol(1);
    expect(protocol01.startingBlockNumber).toBe(0);

    const protocol10 = getProtocol(500000);
    expect(protocol10.startingBlockNumber).toBe(500000);
  });
});

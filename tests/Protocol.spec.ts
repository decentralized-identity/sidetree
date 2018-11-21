import { getProtocol, initializeProtocol } from '../src/Protocol';

describe('Protocol', () => {
  initializeProtocol('protocol-test.json');

  it('should fetch right protocol given the logical blockchain time.', async () => {
    const protocol01 = getProtocol(1);
    expect(protocol01.startingBlockchainTime).toBe(0);

    const protocol10 = getProtocol(500000);
    expect(protocol10.startingBlockchainTime).toBe(500000);
  });
});

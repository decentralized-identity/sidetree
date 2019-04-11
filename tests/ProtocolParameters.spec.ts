import ProtocolParameters from '../src/ProtocolParameters';

describe('ProtocolParameters', () => {
  const versionsOfProtocolParameters = require('../json/protocol-parameters-test.json');
  ProtocolParameters.initialize(versionsOfProtocolParameters);

  it('should fetch right protocol given the logical blockchain time.', async () => {
    const protocol01 = ProtocolParameters.get(1);
    expect(protocol01.startingBlockchainTime).toBe(0);

    const protocol10 = ProtocolParameters.get(500000);
    expect(protocol10.startingBlockchainTime).toBe(500000);
  });
});

import ProtocolVersionMetadata from '../../lib/core/versions/latest/ProtocolVersionMetadata';

describe('ProtocolVersionMetadata', () => {
  it('should use SHA2-256 as hashing algorithm.', async () => {
    // NOTE: 18 = 0x12 = Multihash SHA2-256 code.
    expect(ProtocolVersionMetadata.hashAlgorithmInMultihashCode).toEqual(18);
  });
});

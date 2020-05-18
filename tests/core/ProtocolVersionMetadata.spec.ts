import VersionMetadata from '../../lib/core/versions/latest/VersionMetadata';

describe('VersionMetadata', () => {
  it('should use SHA2-256 as hashing algorithm.', async () => {
    // NOTE: 18 = 0x12 = Multihash SHA2-256 code.
    expect(VersionMetadata.hashAlgorithmInMultihashCode).toEqual(18);
  });
});

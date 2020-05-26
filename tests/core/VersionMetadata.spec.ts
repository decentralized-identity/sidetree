import VersionMetadata from '../../lib/core/versions/latest/VersionMetadata';

describe('VersionMetadata', () => {
  it('should use SHA2-256 as hashing algorithm.', async () => {
    const versionMetadata = new VersionMetadata();
    // NOTE: 18 = 0x12 = Multihash SHA2-256 code.
    expect(versionMetadata.hashAlgorithmInMultihashCode).toEqual(18);
    expect(versionMetadata.normalizedFeeToPerOperationFeeMultiplier).toEqual(0.01);
  });
});

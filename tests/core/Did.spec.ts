import Did from '../../lib/core/Did';

describe('DID', async () => {
  it('isDid() should return false if DID method is not in the DID.', async () => {
    const isDid = Did.isDid('did:abcdefg');
    expect(isDid).toBeFalsy();
  });
});

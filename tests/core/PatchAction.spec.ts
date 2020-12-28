import PatchAction from '../../lib/core/versions/latest/PatchAction';

describe('PatchAction', () => {
  it('should have expected string as enum value', () => {
    expect(PatchAction.Replace).toEqual('replace');
    expect(PatchAction.AddPublicKeys).toEqual('add-public-keys');
    expect(PatchAction.RemovePublicKeys).toEqual('remove-public-keys');
    expect(PatchAction.AddServices).toEqual('add-services');
    expect(PatchAction.RemoveServices).toEqual('remove-services');
  });
});

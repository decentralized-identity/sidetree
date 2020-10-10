import JsonCanonicalizer from '../../../lib/core/versions/latest/util/JsonCanonicalizer';

describe('JsonCanonicalizer', async () => {
  describe('canonicalizeAsBuffer()', async () => {
    it('should match test vector.', async () => {
      const publicKeyJwk = {
        kty: 'EC',
        crv: 'secp256k1',
        x: '5s3-bKjD1Eu_3NJu8pk7qIdOPl1GBzU_V8aR3xiacoM',
        y: 'v0-Q5H3vcfAfQ4zsebJQvMrIg3pcsaJzRvuIYZ3_UOY'
      };

      const canonicalizedBuffer = JsonCanonicalizer.canonicalizeAsBuffer(publicKeyJwk);

      const expectedCanonicalizedString =
        '{"crv":"secp256k1","kty":"EC","x":"5s3-bKjD1Eu_3NJu8pk7qIdOPl1GBzU_V8aR3xiacoM","y":"v0-Q5H3vcfAfQ4zsebJQvMrIg3pcsaJzRvuIYZ3_UOY"}';

      expect(canonicalizedBuffer.toString()).toEqual(expectedCanonicalizedString);
    });
  });
});

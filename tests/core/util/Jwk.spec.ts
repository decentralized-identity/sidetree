import ErrorCode from '../../../lib/core/versions/latest/ErrorCode';
import Jwk from '../../../lib/core/versions/latest/util/Jwk';
import SidetreeError from '../../../lib/common/SidetreeError';

describe('Jwk', async () => {
  describe('validateJwkEs256k()', async () => {
    it('should throw error if JWK has the wrong `kty` value.', async () => {
      const jwk = {
        kty: 'WRONG_TYPE',
        crv: 'secp256k1',
        x: '5s3-bKjD1Eu_3NJu8pk7qIdOPl1GBzU_V8aR3xiacoM',
        y: 'v0-Q5H3vcfAfQ4zsebJQvMrIg3pcsaJzRvuIYZ3_UOY'
      };

      expect(() => { Jwk.validateJwkEs256k(jwk); }).toThrow(new SidetreeError(ErrorCode.JwkEs256kMissingOrInvalidKty));
    });

    it('should throw error if JWK has the wrong `crv` value.', async () => {
      const jwk = {
        kty: 'EC',
        crv: 'WRONG_CURVE',
        x: '5s3-bKjD1Eu_3NJu8pk7qIdOPl1GBzU_V8aR3xiacoM',
        y: 'v0-Q5H3vcfAfQ4zsebJQvMrIg3pcsaJzRvuIYZ3_UOY'
      };

      expect(() => { Jwk.validateJwkEs256k(jwk); }).toThrow(new SidetreeError(ErrorCode.JwkEs256kMissingOrInvalidCrv));
    });

    it('should throw error if JWK has the wrong `x` type.', async () => {
      const jwk = {
        kty: 'EC',
        crv: 'secp256k1',
        x: 123,
        y: 'v0-Q5H3vcfAfQ4zsebJQvMrIg3pcsaJzRvuIYZ3_UOY'
      };

      expect(() => { Jwk.validateJwkEs256k(jwk); }).toThrow(new SidetreeError(ErrorCode.JwkEs256kMissingOrInvalidTypeX));
    });

    it('should throw error if JWK has the wrong `y` type.', async () => {
      const jwk = {
        kty: 'EC',
        crv: 'secp256k1',
        x: '5s3-bKjD1Eu_3NJu8pk7qIdOPl1GBzU_V8aR3xiacoM',
        y: 123
      };

      expect(() => { Jwk.validateJwkEs256k(jwk); }).toThrow(new SidetreeError(ErrorCode.JwkEs256kMissingOrInvalidTypeY));
    });
  });
});

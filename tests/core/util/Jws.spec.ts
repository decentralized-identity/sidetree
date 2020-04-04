import Cryptography from '../../../lib/core/versions/latest/util/Cryptography';
import ErrorCode from '../../../lib/core/versions/latest/ErrorCode';
import Jws from '../../../lib/core/versions/latest/util/Jws';
import SidetreeError from '../../../lib/common/SidetreeError';

describe('Jws', async () => {
  describe('parse()', async () => {
    it('should throw error if protected header contains unexpected property.', async () => {
      const signingKeyId = 'signingKey';
      const [, signingPrivateKey] = await Cryptography.generateKeyPairHex(signingKeyId);

      const protectedHeader = {
        unknownProperty: 'anyValue',
        kid: signingKeyId,
        alg: 'ES256K'
      };

      const payload = { anyProperty: 'anyValue' };

      const jws = await Jws.sign(protectedHeader, payload, signingPrivateKey);

      expect(() => { Jws.parse(jws); }).toThrow(new SidetreeError(ErrorCode.JwsProtectedHeaderMissingOrUnknownProperty));
    });

    it('should throw error if `kid` in header is missing or is in incorrect type.', async () => {
      const signingKeyId = 'signingKey';
      const [, signingPrivateKey] = await Cryptography.generateKeyPairHex(signingKeyId);

      const protectedHeader = {
        kid: true, // Incorect type.
        alg: 'ES256K'
      };

      const payload = { anyProperty: 'anyValue' };

      const jws = await Jws.sign(protectedHeader, payload, signingPrivateKey);

      expect(() => { Jws.parse(jws); }).toThrow(new SidetreeError(ErrorCode.JwsProtectedHeaderMissingOrIncorrectKid));
    });

    it('should throw error if `alg` in header is missing or is in incorrect type.', async () => {
      const signingKeyId = 'signingKey';
      const [, signingPrivateKey] = await Cryptography.generateKeyPairHex(signingKeyId);

      const protectedHeader = {
        kid: signingKeyId,
        alg: true // Incorect type.
      };

      const payload = { anyProperty: 'anyValue' };

      const jws = await Jws.sign(protectedHeader, payload, signingPrivateKey);

      expect(() => { Jws.parse(jws); }).toThrow(new SidetreeError(ErrorCode.JwsProtectedHeaderMissingOrIncorrectAlg));

    });
  });
});

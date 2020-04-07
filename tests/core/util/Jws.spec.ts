import ErrorCode from '../../../lib/core/versions/latest/ErrorCode';
import Jwk from '../../../lib/core/versions/latest/util/Jwk';
import Jws from '../../../lib/core/versions/latest/util/Jws';
import SidetreeError from '../../../lib/common/SidetreeError';
import Encoder from '../../../lib/core/versions/latest/Encoder';

describe('Jws', async () => {
  describe('parse()', async () => {
    it('should throw error if protected header contains unexpected property.', async () => {
      const signingKeyId = 'signingKey';
      const [, signingPrivateKey] = await Jwk.generateEs256kKeyPair();

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
      const [, signingPrivateKey] = await Jwk.generateEs256kKeyPair();

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
      const [, signingPrivateKey] = await Jwk.generateEs256kKeyPair();

      const protectedHeader = {
        kid: signingKeyId,
        alg: 'ES256K'
      };

      const payload = { anyProperty: 'anyValue' };

      const jws = await Jws.sign(protectedHeader, payload, signingPrivateKey);

      // Replace the protected header with an invalid alg type.
      const invalidProtectedHeader = {
        kid: signingKeyId,
        alg: true // Invalid type.
      };
      jws.protected = Encoder.encode(JSON.stringify(invalidProtectedHeader));

      expect(() => { Jws.parse(jws); }).toThrow(new SidetreeError(ErrorCode.JwsProtectedHeaderMissingOrIncorrectAlg));

    });
  });

  describe('verifyCompactJws()', async () => {
    it('should return true if given compact JWS string has a valid signature.', async (done) => {
      const [publicKey, privateKey] = await Jwk.generateEs256kKeyPair();

      const payload = { abc: 'unused value' };
      const compactJws = Jws.signAsCompactJws(payload, privateKey);

      expect(Jws.verifyCompactJws(compactJws, publicKey)).toBeTruthy();
      done();
    });

    it('should return false if given compact JWS string has an ivalid signature.', async (done) => {
      const [publicKey1] = await Jwk.generateEs256kKeyPair();
      const [, privateKey2] = await Jwk.generateEs256kKeyPair();

      const payload = { abc: 'some value' };
      const compactJws = Jws.signAsCompactJws(payload, privateKey2); // Intentionally signing with a different key.

      expect(Jws.verifyCompactJws(compactJws, publicKey1)).toBeFalsy();
      done();
    });

    it('should return false if input is not a valid JWS string', async (done) => {
      const input = 'some invalid string';
      const [publicKey] = await Jwk.generateEs256kKeyPair();

      expect(Jws.verifyCompactJws(input, publicKey)).toBeFalsy();
      done();
    });
  });
});

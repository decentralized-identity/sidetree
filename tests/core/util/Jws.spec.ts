import ErrorCode from '../../../lib/core/versions/latest/ErrorCode';
import Jwk from '../../../lib/core/versions/latest/util/Jwk';
import Jws from '../../../lib/core/versions/latest/util/Jws';
import SidetreeError from '../../../lib/common/SidetreeError';
import Encoder from '../../../lib/core/versions/latest/Encoder';

describe('Jws', async () => {
  describe('parseCompactJws()', async () => {
    it('should throw error if given input to parse is not a string.', async () => {
      const expectKidInHeader = false;

      const anyObject = { a: 'abc' };

      expect(() => { Jws.parseCompactJws(anyObject, expectKidInHeader); }).toThrow(new SidetreeError(ErrorCode.JwsCompactJwsNotString));
    });

    it('should throw error if given input string has more than 3 parts separated by a "." character.', async () => {
      const expectKidInHeader = false;

      const invalidCompactJwsString = 'aaa.bbb.ccc.ddd';

      expect(() => { Jws.parseCompactJws(invalidCompactJwsString, expectKidInHeader); }).toThrow(new SidetreeError(ErrorCode.JwsCompactJwsInvalid));
    });

    it('should throw error if protected header contains unexpected property.', async () => {
      const signingKeyId = 'signingKey';
      const [, signingPrivateKey] = await Jwk.generateEs256kKeyPair();

      const protectedHeader = {
        unknownProperty: 'anyValue',
        kid: signingKeyId,
        alg: 'ES256K'
      };

      const payload = { anyProperty: 'anyValue' };

      const jws = Jws.signAsCompactJws(payload, signingPrivateKey, protectedHeader);
      const expectKidInHeader = true;

      expect(() => { Jws.parseCompactJws(jws, expectKidInHeader); }).toThrow(new SidetreeError(ErrorCode.JwsProtectedHeaderMissingOrUnknownProperty));
    });

    it('should throw error if `kid` in header is missing or is in incorrect type.', async () => {
      const [, signingPrivateKey] = await Jwk.generateEs256kKeyPair();

      const invalidProtectedHeader = {
        kid: true, // Invalid type.
        alg: 'ES256K'
      };

      const payload = { anyProperty: 'anyValue' };

      const jws = Jws.signAsCompactJws(payload, signingPrivateKey, invalidProtectedHeader);
      const expectKidInHeader = true;

      expect(() => { Jws.parseCompactJws(jws, expectKidInHeader); }).toThrow(new SidetreeError(ErrorCode.JwsProtectedHeaderMissingOrIncorrectKid));
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
      const invalidEncodedProtectedHeader = Encoder.encode(JSON.stringify(invalidProtectedHeader));

      const compactJws = Jws.createCompactJws(invalidEncodedProtectedHeader, jws.payload, jws.signature);
      const expectKidInHeader = true;

      expect(() => { Jws.parseCompactJws(compactJws, expectKidInHeader); }).toThrow(new SidetreeError(ErrorCode.JwsProtectedHeaderMissingOrIncorrectAlg));
    });

    it('should throw error if payload is not Base64URL string.', async () => {
      const protectedHeader = {
        alg: 'ES256K'
      };
      const encodedProtectedHeader = Encoder.encode(JSON.stringify(protectedHeader));

      const compactJws = Jws.createCompactJws(encodedProtectedHeader, '***InvalidPayloadString****', 'anyValidBase64UrlStringAsSignature');
      const expectKidInHeader = false;

      expect(() => { Jws.parseCompactJws(compactJws, expectKidInHeader); }).toThrow(new SidetreeError(ErrorCode.JwsPayloadNotBase64UrlString));
    });

    it('should throw error if signature is not Base64URL string.', async () => {
      const protectedHeader = {
        alg: 'ES256K'
      };
      const encodedProtectedHeader = Encoder.encode(JSON.stringify(protectedHeader));

      const compactJws = Jws.createCompactJws(encodedProtectedHeader, 'anyValidBase64UrlStringAsPayload', '***InvalidSignatureString****');
      const expectKidInHeader = false;

      expect(() => { Jws.parseCompactJws(compactJws, expectKidInHeader); }).toThrow(new SidetreeError(ErrorCode.JwsSignatureNotBase64UrlString));
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

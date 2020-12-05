import Encoder from '../../lib/core/versions/latest/Encoder';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import JasmineSidetreeErrorValidator from '../JasmineSidetreeErrorValidator';
import JsonCanonicalizer from '../../lib/core/versions/latest/util/JsonCanonicalizer';
import Multihash from '../../lib/core/versions/latest/Multihash';

describe('Multihash', async () => {

  describe('isValidHash()', async () => {
    it('should return false if content is undefined', async () => {
      const result = Multihash.isValidHash(undefined, 'anyCommitment');
      expect(result).toBeFalsy();
    });

    it('should return false if encountered an unexpected error.', async () => {
      const multihashHashSpy = spyOn(Multihash as any, 'verifyEncodedMultihashForContent').and.throwError('Simulated error message.');
      const result = Multihash.isValidHash('revealValue', 'commitmentHash');

      expect(multihashHashSpy).toHaveBeenCalled();
      expect(result).toBeFalsy();
    });
  });

  describe('hash()', async () => {
    it('should throws if given an unsupported hash algorithm.', async () => {
      const unsupportedHashAlgorithm = 19; // SHA2-512
      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => Multihash.hash(Buffer.from('any content'), unsupportedHashAlgorithm),
        ErrorCode.MultihashUnsupportedHashAlgorithm
      );
    });
  });

  describe('canonicalizeAndVerifyDoubleHash()', async () => {
    it('should return false if `undefined` is given as content.', async () => {
      const validHash = Multihash.canonicalizeAndVerifyDoubleHash(undefined, 'unusedMultihashValue');

      expect(validHash).toBeFalsy();
    });

    it('should return false if unexpected error is caught.', async () => {
      // Simulate an error thrown.
      spyOn(JsonCanonicalizer, 'canonicalizeAsBuffer').and.throwError('any error');

      const validHash = Multihash.canonicalizeAndVerifyDoubleHash({ unused: 'unused' }, 'unusedMultihashValue');

      expect(validHash).toBeFalsy();
    });
  });

  describe('verify()', async () => {
    it('should return false if unexpected error is caught.', async () => {
      // Simulate an error thrown.
      spyOn(Encoder, 'decodeAsBuffer').and.throwError('any error');

      const validHash = (Multihash as any).verifyEncodedMultihashForContent(Buffer.from('anyValue'), 'unusedMultihashValue');

      expect(validHash).toBeFalsy();
    });

    it('should return false if given encoded multihash is not using the canonical encoding.', async () => {
      const anyContent = Buffer.from('any content');

      // Canonical encoded multihash of 'any content' is 'EiDDidVHVekuMIYV3HI5nfp8KP6s3_W44Pd-MO5b-XK5iQ'
      const defaultContentEncodedMultihash = 'EiDDidVHVekuMIYV3HI5nfp8KP6s3_W44Pd-MO5b-XK5iQ';
      const modifiedContentEncodedMultihash = 'EiDDidVHVekuMIYV3HI5nfp8KP6s3_W44Pd-MO5b-XK5iR';

      // Two multihash strings decodes into the same buffer.
      expect(Encoder.decodeAsBuffer(defaultContentEncodedMultihash)).toEqual(Encoder.decodeAsBuffer(modifiedContentEncodedMultihash));

      const validHashCheckResult = (Multihash as any).verifyEncodedMultihashForContent(anyContent, defaultContentEncodedMultihash);
      const invalidHashCheckResult = (Multihash as any).verifyEncodedMultihashForContent(anyContent, modifiedContentEncodedMultihash);

      expect(validHashCheckResult).toBeTruthy();
      expect(invalidHashCheckResult).toBeFalsy();
    });
  });

  describe('verifyDoubleHash()', async () => {
    it('should return false if unexpected error is caught.', async () => {
      // Simulate an error thrown.
      spyOn(Encoder, 'decodeAsBuffer').and.throwError('any error');

      const validHash = (Multihash as any).verifyDoubleHash(Buffer.from('anyValue'), 'unusedMultihashValue');

      expect(validHash).toBeFalsy();
    });
  });
});

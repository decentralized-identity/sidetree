import * as crypto from 'crypto';
import Encoder from '../../lib/core/versions/latest/Encoder';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import JasmineSidetreeErrorValidator from '../JasmineSidetreeErrorValidator';
import JsonCanonicalizer from '../../lib/core/versions/latest/util/JsonCanonicalizer';
import Multihash from '../../lib/core/versions/latest/Multihash';
import OperationGenerator from '../generators/OperationGenerator';
const multihashes = require('multihashes');

describe('Multihash', async () => {
  describe('getHashAlgorithmCode()', async () => {
    it('should throws if multihash buffer given used an unsupported hash algorithm.', async () => {
      const content = 'any content';
      const hash = crypto.createHash('sha512').update(content).digest();
      const multihash = multihashes.encode(hash, 19); // SHA2-512

      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => Multihash.getHashAlgorithmCode(multihash),
        ErrorCode.MultihashUnsupportedHashAlgorithm
      );
    });
  });

  describe('verifyHashComputedUsingLatestSupportedAlgorithm()', async () => {
    it('should throws if multihash buffer given is not the latest supported hash algorithm.', async () => {
      const content = 'any content';
      const hash = crypto.createHash('sha512').update(content).digest();
      const multihash = multihashes.encode(hash, 19); // SHA2-512

      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => Multihash.verifyHashComputedUsingLatestSupportedAlgorithm(multihash),
        ErrorCode.MultihashNotLatestSupportedHashAlgorithm
      );
    });
  });

  describe('isValidHash()', async () => {
    it('should return false if content is undefined', async () => {
      const [, anyCommitment] = OperationGenerator.generateCommitRevealPair();
      const result = Multihash.isValidHash(undefined, anyCommitment);
      expect(result).toBeFalsy();
    });

    it('should return false if encountered an unexpected error.', async () => {
      const [revealValue, commitmentHash] = OperationGenerator.generateCommitRevealPair();

      const multihashHashSpy = spyOn(Multihash as any, 'verify').and.throwError('Simulated error message.');
      const result = Multihash.isValidHash(revealValue, commitmentHash);

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

  describe('canonicalizeAndVerify()', async () => {
    it('should return false if `undefined` is given as content.', async () => {
      const validHash = Multihash.canonicalizeAndVerify(undefined, 'unusedMultihashValue');

      expect(validHash).toBeFalsy();
    });

    it('should return false if unexpected error is caught.', async () => {
      // Simulate an error thrown.
      spyOn(JsonCanonicalizer, 'canonicalizeAsBuffer').and.throwError('any error');

      const validHash = Multihash.canonicalizeAndVerify({ unused: 'unused' }, 'unusedMultihashValue');

      expect(validHash).toBeFalsy();
    });
  });

  describe('verify()', async () => {
    it('should return false if unexpected error is caught.', async () => {
      // Simulate an error thrown.
      spyOn(Encoder, 'decodeAsBuffer').and.throwError('any error');

      const validHash = (Multihash as any).verify(Buffer.from('anyValue'), 'unusedMultihashValue');

      expect(validHash).toBeFalsy();
    });
  });
});

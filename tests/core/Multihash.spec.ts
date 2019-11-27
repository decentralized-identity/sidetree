import * as crypto from 'crypto';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import JasmineSidetreeErrorValidator from '../JasmineSidetreeErrorValidator';
import Multihash from '../../lib/core/versions/latest/Multihash';
const multihashes = require('multihashes');

describe('Multihash', async () => {
  describe('getHashAlgorithmCode()', async () => {
    it('should throws if multihash buffer given used an unsupported hash algorithm.', async () => {
      const content = 'any content';
      const hash = crypto.createHash('sha256').update(content).digest();
      const multihash = multihashes.encode(hash, 11); // SHA1

      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => Multihash.getHashAlgorithmCode(multihash),
        ErrorCode.MultihashUnsupportedHashAlgorithm
      );
    });
  });
});

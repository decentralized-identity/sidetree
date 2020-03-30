import Encoder from '../../lib/core/versions/latest/Encoder';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import JasmineSidetreeErrorValidator from '../JasmineSidetreeErrorValidator';

describe('Encoder', async () => {
  describe('decodeAsBuffer()', async () => {
    it('should throw if input is not a string.', async (done) => {
      const input = undefined;
      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        async () => Encoder.decodeAsBuffer(input as any),
        ErrorCode.EncoderValidateBase64UrlStringInputNotString
      );
      done();
    });

    it('should throw if input string is not Base64URL string.', async (done) => {
      const input = 'inputStringContainingNonBase64UrlCharsLike#';
      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        async () => Encoder.decodeAsBuffer(input),
        ErrorCode.EncoderValidateBase64UrlStringInputNotBase64UrlString
        );
      done();
    });
  });
});

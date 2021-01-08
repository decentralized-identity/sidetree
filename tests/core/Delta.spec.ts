import Delta from '../../lib/core/versions/latest/Delta';
import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import JasmineSidetreeErrorValidator from '../JasmineSidetreeErrorValidator';

function generateLongString (length: number): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    result = result + 'a';
  }
  return result;
}

describe('Delta', () => {
  describe('validateDelta', () => {
    it('should throw sidetree error if delta size exceeds max limit', () => {
      const mockDelta = {
        someKey: generateLongString(2000)
      };
      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => { Delta.validateDelta(mockDelta); },
        ErrorCode.DeltaExceedsMaximumSize
      );
    });

    it('should throw sidetree error if delta is null', () => {
      const mockDelta = null;
      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => { Delta.validateDelta(mockDelta); },
        ErrorCode.DeltaIsNullOrUndefined
      );
    });

    it('should throw sidetree error if delta is undefined', () => {
      const mockDelta = undefined;
      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => { Delta.validateDelta(mockDelta); },
        ErrorCode.DeltaIsNullOrUndefined
      );
    });
  });
});

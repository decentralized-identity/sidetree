import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import InputValidator from '../../lib/core/versions/latest/InputValidator';
import JasmineSidetreeErrorValidator from '../JasmineSidetreeErrorValidator';

describe('InputValidator', async () => {
  describe('validateNonArrayObject()', () => {
    it('should throws if input is an array.', async () => {
      const array: string[] = [];
      const inputObjectContext = 'anyObjectContext';

      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => InputValidator.validateNonArrayObject(array, inputObjectContext),
        ErrorCode.InputValidatorInputCannotBeAnArray,
        inputObjectContext
      );
    });
  });

  describe('validateDidType', () => {
    it('should not throw if type is undefined', () => {
      try {
        InputValidator['validateDidType'](undefined);
      } catch (e) {
        fail(`Expect not to throw but got ${e}`);
      }
    });

    it('should throw sidetree error if type is not a string', () => {
      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(() => {
        InputValidator['validateDidType'](123 as any);
      }, ErrorCode.SuffixDataTypeIsNotString);
    });

    it('should throw sidetree error if type length is greater than 4', () => {
      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(() => {
        InputValidator['validateDidType']('12345');
      }, ErrorCode.SuffixDataTypeLengthGreaterThanFour);
    });

    it('should throw sidetree error if type is not base64url', () => {
      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(() => {
        InputValidator['validateDidType']('?=');
      }, ErrorCode.SuffixDataTypeInvalidCharacter);
    });

    it('should not throw if type is valid', () => {
      try {
        InputValidator['validateDidType']('abcd');
      } catch (e) {
        fail(`Expect not to throw but got ${e}`);
      }
    });
  });
});

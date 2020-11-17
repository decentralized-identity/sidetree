import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import InputValidator from '../../lib/core/versions/latest/InputValidator';
import JasmineSidetreeErrorValidator from '../JasmineSidetreeErrorValidator';

describe('InputValidator', async () => {
  describe('validateNonArrayObject()', async () => {
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
});

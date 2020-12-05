import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import JasmineSidetreeErrorValidator from '../JasmineSidetreeErrorValidator';
import Operation from '../../lib/core/versions/latest/Operation';
import SidetreeError from '../../lib/common/SidetreeError';

describe('Operation', async () => {
  describe('parse()', async () => {
    it('should throw if operation of unknown type is given.', async (done) => {
      const operationOfUnknownType = {
        type: 'unknown',
        anyProperty: 'anyContent'
      };
      const operationBuffer = Buffer.from(JSON.stringify(operationOfUnknownType));

      await expectAsync(Operation.parse(operationBuffer)).toBeRejectedWith(new SidetreeError(ErrorCode.OperationTypeUnknownOrMissing));
      done();
    });
  });

  describe('validateDelta', () => {
    it('should throw sidetree error if input is not an object', () => {
      const input = 'this is not an object, this is a string';

      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => Operation.validateDelta(input),
        ErrorCode.InputValidatorInputIsNotAnObject,
        'delta'
      );
    });
  });
});

import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import FeeManager from '../../lib/core/versions/latest/FeeManager';
import JasmineSidetreeErrorValidator from '../JasmineSidetreeErrorValidator';
import ProtocolParameters from '../../lib/core/versions/latest/ProtocolParameters';

describe('FeeManager', async () => {

  beforeAll(() => {
    ProtocolParameters.maxNumberOfOperationsForNoValueTimeLock = 100;
    ProtocolParameters.normalizedFeeToPerOperationFeeMultiplier = 0.001;
  });

  describe('computeMinimumTransactionFee', async () => {

    it('should calculate fee correctly.', async () => {
      const normalizedFee = 1000;
      const numberOfOperations = 1000;
      const fee = FeeManager.computeMinimumTransactionFee(normalizedFee, numberOfOperations);

      expect(fee).toEqual(1000);
    });

    it('should return at least the normalized fee if the calculated fee is lower', async () => {
      const fee = FeeManager.computeMinimumTransactionFee(100, 1);

      expect(fee).toEqual(100);
    });

    it('should fail if the number of operations is <= 0', async () => {
      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => FeeManager.computeMinimumTransactionFee(100, 0),
        ErrorCode.OperationCountLessThanZero);

      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => FeeManager.computeMinimumTransactionFee(100, -1),
        ErrorCode.OperationCountLessThanZero);
    });
  });

  describe('verifyTransactionFeeAndThrowOnError', async () => {

    it('should not throw if the fee paid is at least the expected fee', async () => {
      try {
        const feeToPay = FeeManager.computeMinimumTransactionFee(100, 100);
        FeeManager.verifyTransactionFeeAndThrowOnError(feeToPay, 100, 100);
      } catch (e) {
        fail();
      }
    });

    it('should not throw if the fee paid is at least the expected fee (0% markup)', async () => {
      try {
        const feeToPay = FeeManager.computeMinimumTransactionFee(100, 100);
        FeeManager.verifyTransactionFeeAndThrowOnError(feeToPay, 100, 100);
      } catch (e) {
        fail();
      }
    });

    it('should throw if the fee paid is less than the expected fee', async () => {
      const feePaid = 2000; // Make fee paid very small.
      const numberOfOperations = 10000;
      const normalizedFee = 1000;

      // Make the next call w/ a large number of operations to simulate the error condition.
      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => FeeManager.verifyTransactionFeeAndThrowOnError(feePaid, numberOfOperations, normalizedFee),
        ErrorCode.TransactionFeePaidInvalid);
    });

    it('should throw if the fee paid is less than the normalized fee', async () => {

      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => FeeManager.verifyTransactionFeeAndThrowOnError(99, 10, 100),
        ErrorCode.TransactionFeePaidLessThanNormalizedFee);
    });

    it('should throw if the number of operations are <= 0', async () => {
      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => FeeManager.verifyTransactionFeeAndThrowOnError(101, 0, 10),
        ErrorCode.OperationCountLessThanZero);

      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => FeeManager.verifyTransactionFeeAndThrowOnError(101, -1, 10),
        ErrorCode.OperationCountLessThanZero);
    });
  });
});

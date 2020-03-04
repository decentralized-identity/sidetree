import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import FeeManager from '../../lib/core/versions/latest/FeeManager';
import JasmineSidetreeErrorValidator from '../JasmineSidetreeErrorValidator';

describe('FeeManager', async () => {

  describe('computeMinimumTransactionFee', async () => {

    it('should return calculated fee if it is greater', async () => {
      const fee = FeeManager.computeMinimumTransactionFee(2, 10000);

      expect(fee).toEqual(200);
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
      const feeToPay = FeeManager.computeMinimumTransactionFee(100, 100);

      // Make the next call w/ a large number of operations to simulate the error condition.
      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => FeeManager.verifyTransactionFeeAndThrowOnError(feeToPay, 1000, 100),
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

import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import FeeManager from '../../lib/core/versions/latest/FeeManager';
import JasmineHelper from '../JasmineHelper';
import { SidetreeError } from '../../lib/core/Error';

describe('FeeManager', async () => {

  describe('convertNormalizedFeeToTransactionFee', async () => {

    it('should add the markup margin to the transaction fee', async () => {
      const fee = FeeManager.convertNormalizedFeeToTransactionFee(100, 100, 0.05);

      expect(fee).toEqual(105);
    });

    it('should fail if the number of operations is <= 0', async () => {
      JasmineHelper.expectSideTreeErrorToBeThrown(
        () => FeeManager.convertNormalizedFeeToTransactionFee(100, 0, 0.05),
        new SidetreeError(ErrorCode.OperationCountLessThanZero));

      JasmineHelper.expectSideTreeErrorToBeThrown(
        () => FeeManager.convertNormalizedFeeToTransactionFee(100, -1, 0.05),
        new SidetreeError(ErrorCode.OperationCountLessThanZero));
    });
  });

  describe('verifyTransactionFeeAndThrowOnError', async () => {

    it('should not throw if the fee paid is at least the expected fee', async () => {
      try {
        const feeToPay = FeeManager.convertNormalizedFeeToTransactionFee(100, 100, 0.05);
        FeeManager.verifyTransactionFeeAndThrowOnError(feeToPay, 100, 100);
      } catch (e) {
        fail();
      }
    });

    it('should not throw if the fee paid is at least the expected fee (0% markup)', async () => {
      try {
        const feeToPay = FeeManager.convertNormalizedFeeToTransactionFee(100, 100, 0);
        FeeManager.verifyTransactionFeeAndThrowOnError(feeToPay, 100, 100);
      } catch (e) {
        fail();
      }
    });

    it('should throw if the fee paid is less than the expected fee', async () => {
      const feeToPay = FeeManager.convertNormalizedFeeToTransactionFee(100, 100, 0);

      JasmineHelper.expectSideTreeErrorToBeThrown(
        () => FeeManager.verifyTransactionFeeAndThrowOnError(feeToPay - 1, 100, 100),
        new SidetreeError(ErrorCode.TransactionFeeInvalid));
    });

    it('should throw if the number of operations are <= 0', async() => {
      JasmineHelper.expectSideTreeErrorToBeThrown(
        () => FeeManager.verifyTransactionFeeAndThrowOnError(101, 0, 10),
        new SidetreeError(ErrorCode.OperationCountLessThanZero));

      JasmineHelper.expectSideTreeErrorToBeThrown(
        () => FeeManager.verifyTransactionFeeAndThrowOnError(101, -1, 10),
        new SidetreeError(ErrorCode.OperationCountLessThanZero));
    });
  });
});

import FeeManager from '../../lib/core/versions/latest/FeeManager';

describe('FeeManager', async () => {

  describe('convertNormalizedFeeToTransactionFee', async () => {

    it('should add the markup margin to the transaction fee', async () => {
      const fee = FeeManager.convertNormalizedFeeToTransactionFee(100, 100, 0.05);

      expect(fee).toEqual(105);
    });

    it('should fail if the number of operations is <= 0', async () => {
      expect(() => { FeeManager.convertNormalizedFeeToTransactionFee(100, 0, 0.05); }).toThrow();
      expect(() => { FeeManager.convertNormalizedFeeToTransactionFee(100, -1, 0.05); }).toThrow();
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

      expect(() => { FeeManager.verifyTransactionFeeAndThrowOnError(feeToPay - 1, 100, 100); }).toThrow();
    });

    it('should throw if the number of operations are <= 0', async () => {
      expect(() => { FeeManager.verifyTransactionFeeAndThrowOnError(101, 0, 10); }).toThrow();
      expect(() => { FeeManager.verifyTransactionFeeAndThrowOnError(101, -1, 10); }).toThrow();
    });

    it('should throw if the actual fee is less than the expected fee', () => {
      expect(() => { FeeManager.verifyTransactionFeeAndThrowOnError(101, -1, 10); }).toThrow();
    });
  });
});

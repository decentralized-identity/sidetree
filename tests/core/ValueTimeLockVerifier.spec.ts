import ProtocolParameters from '../../lib/core/versions/latest/ProtocolParameters';
import ValueTimeLockVerifier from '../../lib/core/versions/latest/ValueTimeLockVerifier';

fdescribe('ValueTimeLockVerifier', () => {

  describe('calculateRequiredLockAmount', () => {
    it('should return the correct lock amount', () => {
      const numberOfOpsInput = ProtocolParameters.maxNumberOfOpsForNoValueTimeLock;
      const normalizedFeeInput = 3;

      const expectedAmount = normalizedFeeInput
                             * ProtocolParameters.normalizedFeeToPerOperationFeeMultiplier
                             * numberOfOpsInput
                             * ProtocolParameters.valueTimeLockAmountMultiplier;

      const actual = ValueTimeLockVerifier.calculateRequiredLockAmount(numberOfOpsInput, normalizedFeeInput);
      expect(actual).toEqual(expectedAmount);
    });

    it('should return 0 if the number of operations do not require any lock', () => {
      const numberOfOpsInput = ProtocolParameters.maxNumberOfOpsForNoValueTimeLock;
      const actual = ValueTimeLockVerifier.calculateRequiredLockAmount(numberOfOpsInput, 2);

      expect(actual).toEqual(0);
    });

  });

  describe('getMaxNumberOfOpsForZeroLockAmount', () => {
    it('should return the correct value', () => {
      const actual = ValueTimeLockVerifier.getMaxNumberOfOpsForZeroLockAmount();

      expect(actual).toEqual(ProtocolParameters.maxNumberOfOpsForNoValueTimeLock);
    });
  });

  describe('verifyLockAmountAndThrowOnError', () => {
    it('should not throw errors if the required amount is 0', () => {
      spyOn(ValueTimeLockVerifier, 'calculateRequiredLockAmount').and.returnValue(0);

      ValueTimeLockVerifier.verifyLockAmountAndThrowOnError(undefined, 10, 2, 1234);
      // No exception == valid
    });
  });
});

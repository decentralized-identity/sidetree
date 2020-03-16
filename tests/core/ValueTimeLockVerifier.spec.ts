import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import JasmineSidetreeErrorValidator from '../JasmineSidetreeErrorValidator';
import ProtocolParameters from '../../lib/core/versions/latest/ProtocolParameters';
import ValueTimeLockVerifier from '../../lib/core/versions/latest/ValueTimeLockVerifier';
import ValueTimeLockModel from '../../lib/common/models/ValueTimeLockModel';

describe('ValueTimeLockVerifier', () => {

  describe('calculateMaxNumberOfOpsAllowed', () => {
    it('should return the correct lock amount', () => {
      const valueTimeLockInput: ValueTimeLockModel = {
        amountLocked: 1234,
        identifier: 'identifier',
        lockTransactionTime: 1234,
        unlockTransactionTime: 1240,
        owner: 'owner'
      };

      const normalizedFeeInput = 3;
      const feePerOp = normalizedFeeInput * ProtocolParameters.normalizedFeeToPerOperationFeeMultiplier;
      const numOfOps = valueTimeLockInput.amountLocked / (feePerOp * ProtocolParameters.valueTimeLockAmountMultiplier);
      const expectedNumOfOps = Math.floor(numOfOps);

      const actual = ValueTimeLockVerifier.calculateMaxNumberOfOpsAllowed(valueTimeLockInput, normalizedFeeInput);
      expect(actual).toEqual(expectedNumOfOps);
    });

    it('should return number of free ops if the value lock is undefined.', () => {
      const actual = ValueTimeLockVerifier.calculateMaxNumberOfOpsAllowed(undefined, 2);

      expect(actual).toEqual(ProtocolParameters.maxNumberOfOpsForNoValueTimeLock);
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

    it('shoud throw if the lock is undefined but the lock is needed.', () => {
      spyOn(ValueTimeLockVerifier, 'calculateRequiredLockAmount').and.returnValue(100);

      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => ValueTimeLockVerifier.verifyLockAmountAndThrowOnError(undefined, 10, 200, 12324),
        ErrorCode.ValueTimeLockRequired);
    });

    it('shoud throw if the current block is earlier than the lock start time.', () => {
      spyOn(ValueTimeLockVerifier, 'calculateRequiredLockAmount').and.returnValue(100);

      const valueTimeLockinput: ValueTimeLockModel = {
        amountLocked: 100,
        identifier: 'identifier',
        lockTransactionTime: 1234,
        unlockTransactionTime: 7890,
        owner: 'owner'
      };

      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => ValueTimeLockVerifier.verifyLockAmountAndThrowOnError(valueTimeLockinput, 10, 200, valueTimeLockinput.lockTransactionTime - 1),
        ErrorCode.ValueTimeLockTargetTransactionTimeOutsideLockRange);
    });

    it('shoud throw if the lock is later than the lock end time.', () => {
      spyOn(ValueTimeLockVerifier, 'calculateRequiredLockAmount').and.returnValue(100);

      const valueTimeLockinput: ValueTimeLockModel = {
        amountLocked: 100,
        identifier: 'identifier',
        lockTransactionTime: 1234,
        unlockTransactionTime: 7890,
        owner: 'owner'
      };

      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => ValueTimeLockVerifier.verifyLockAmountAndThrowOnError(valueTimeLockinput, 10, 200, valueTimeLockinput.unlockTransactionTime),
        ErrorCode.ValueTimeLockTargetTransactionTimeOutsideLockRange);
    });

    it('shoud throw if the lock amoutn is less than the required amount.', () => {
      const mockRequiredlockAmount = 234;
      spyOn(ValueTimeLockVerifier, 'calculateRequiredLockAmount').and.returnValue(mockRequiredlockAmount);

      const valueTimeLockinput: ValueTimeLockModel = {
        amountLocked: mockRequiredlockAmount - 1,
        identifier: 'identifier',
        lockTransactionTime: 1234,
        unlockTransactionTime: 7890,
        owner: 'owner'
      };

      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => ValueTimeLockVerifier.verifyLockAmountAndThrowOnError(valueTimeLockinput, 10, 200, valueTimeLockinput.lockTransactionTime + 1),
        ErrorCode.ValueTimeLockInsufficentLockAmount);
    });

    it('shoud not throw if all of the checks pass.', () => {
      const mockRequiredlockAmount = 234;
      spyOn(ValueTimeLockVerifier, 'calculateRequiredLockAmount').and.returnValue(mockRequiredlockAmount);

      const valueTimeLockinput: ValueTimeLockModel = {
        amountLocked: mockRequiredlockAmount + 1,
        identifier: 'identifier',
        lockTransactionTime: 1234,
        unlockTransactionTime: 7890,
        owner: 'owner'
      };

      ValueTimeLockVerifier.verifyLockAmountAndThrowOnError(valueTimeLockinput, 10, 200, valueTimeLockinput.lockTransactionTime + 1);

      // no exception === no unexpected errors.
    });
  });
});

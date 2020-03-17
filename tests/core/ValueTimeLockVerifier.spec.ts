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

  describe('verifyLockAmountAndThrowOnError', () => {
    it('should throw if the lock-owner and transaction-writer do not match', () => {
      const valueTimeLockInput: ValueTimeLockModel = {
        amountLocked: 1234,
        identifier: 'identifier',
        lockTransactionTime: 1234,
        unlockTransactionTime: 1235,
        owner: 'lock-owner'
      };

      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => ValueTimeLockVerifier.verifyLockAmountAndThrowOnError(valueTimeLockInput, 10, 123, 12, 'txn writer'),
        ErrorCode.ValueTimeLockTransactionWriterLockOwnerMismatch);
    });

    it('shoud throw if the current block is earlier than the lock start time.', () => {
      const valueTimeLockinput: ValueTimeLockModel = {
        amountLocked: 100,
        identifier: 'identifier',
        lockTransactionTime: 1234,
        unlockTransactionTime: 7890,
        owner: 'owner'
      };

      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () =>
          ValueTimeLockVerifier.verifyLockAmountAndThrowOnError(
            valueTimeLockinput,
            10,
            200,
            valueTimeLockinput.lockTransactionTime - 1,
            valueTimeLockinput.owner),
        ErrorCode.ValueTimeLockTargetTransactionTimeOutsideLockRange);
    });

    it('shoud throw if the lock is later than the lock end time.', () => {
      const valueTimeLockinput: ValueTimeLockModel = {
        amountLocked: 100,
        identifier: 'identifier',
        lockTransactionTime: 1234,
        unlockTransactionTime: 7890,
        owner: 'owner'
      };

      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () =>
          ValueTimeLockVerifier.verifyLockAmountAndThrowOnError(
            valueTimeLockinput,
            10,
            200,
            valueTimeLockinput.unlockTransactionTime,
            valueTimeLockinput.owner),
        ErrorCode.ValueTimeLockTargetTransactionTimeOutsideLockRange);
    });

    it('shoud throw if the lock amoutn is less than the required amount.', () => {
      const mockMaxNumOfOps = 234;
      spyOn(ValueTimeLockVerifier, 'calculateMaxNumberOfOpsAllowed').and.returnValue(mockMaxNumOfOps);

      const valueTimeLockinput: ValueTimeLockModel = {
        amountLocked: 123,
        identifier: 'identifier',
        lockTransactionTime: 1234,
        unlockTransactionTime: 7890,
        owner: 'owner'
      };

      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () =>
          ValueTimeLockVerifier.verifyLockAmountAndThrowOnError(
            valueTimeLockinput,
            mockMaxNumOfOps + 1,
            200,
            valueTimeLockinput.lockTransactionTime + 1,
            valueTimeLockinput.owner),
        ErrorCode.ValueTimeLockInvalidNumberOfOperations);
    });

    it('shoud not throw if all of the checks pass.', () => {
      const mockMaxNumOfOps = 234;
      spyOn(ValueTimeLockVerifier, 'calculateMaxNumberOfOpsAllowed').and.returnValue(mockMaxNumOfOps);

      const valueTimeLockinput: ValueTimeLockModel = {
        amountLocked: 123,
        identifier: 'identifier',
        lockTransactionTime: 1234,
        unlockTransactionTime: 7890,
        owner: 'owner'
      };

      ValueTimeLockVerifier.verifyLockAmountAndThrowOnError(
        valueTimeLockinput,
        mockMaxNumOfOps,
        200,
        valueTimeLockinput.lockTransactionTime + 1,
        valueTimeLockinput.owner);

      // no exception === no unexpected errors.
    });
  });
});

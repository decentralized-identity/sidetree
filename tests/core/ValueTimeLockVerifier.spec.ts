import ErrorCode from '../../lib/core/versions/latest/ErrorCode';
import JasmineSidetreeErrorValidator from '../JasmineSidetreeErrorValidator';
import ProtocolParameters from '../../lib/core/versions/latest/ProtocolParameters';
import ValueTimeLockVerifier from '../../lib/core/versions/latest/ValueTimeLockVerifier';
import ValueTimeLockModel from '../../lib/common/models/ValueTimeLockModel';

describe('ValueTimeLockVerifier', () => {

  describe('calculateMaxNumberOfOperationsAllowed', () => {
    it('should return the correct lock amount', () => {
      const valueTimeLockInput: ValueTimeLockModel = {
        amountLocked: 12349876, // large amount to allow more than free number of ops
        identifier: 'identifier',
        lockTransactionTime: 1234,
        unlockTransactionTime: 1240,
        normalizedFee: 3,
        owner: 'owner'
      };

      const feePerOp = valueTimeLockInput.normalizedFee * ProtocolParameters.normalizedFeeToPerOperationFeeMultiplier;
      const numOfOps = valueTimeLockInput.amountLocked / (feePerOp * ProtocolParameters.valueTimeLockAmountMultiplier);
      const expectedNumOfOps = Math.floor(numOfOps);

      const actual = ValueTimeLockVerifier.calculateMaxNumberOfOperationsAllowed(valueTimeLockInput);
      expect(actual).toEqual(expectedNumOfOps);
    });

    it('should return the number of free ops if the lock amount is too small', () => {
      const valueTimeLockInput: ValueTimeLockModel = {
        amountLocked: 100, // low amount to allow less than free number of ops
        identifier: 'identifier',
        lockTransactionTime: 1234,
        unlockTransactionTime: 1240,
        normalizedFee: 100,
        owner: 'owner'
      };

      const actual = ValueTimeLockVerifier.calculateMaxNumberOfOperationsAllowed(valueTimeLockInput);
      expect(actual).toEqual(ProtocolParameters.maxNumberOfOperationsForNoValueTimeLock);
    });

    it('should return number of free ops if the value lock is undefined.', () => {
      const actual = ValueTimeLockVerifier.calculateMaxNumberOfOperationsAllowed(undefined);

      expect(actual).toEqual(ProtocolParameters.maxNumberOfOperationsForNoValueTimeLock);
    });
  });

  describe('verifyLockAmountAndThrowOnError', () => {
    it('should not throw if the number of operations are less than the free-operations-count', () => {
      const calcMaxOpsSpy = spyOn(ValueTimeLockVerifier, 'calculateMaxNumberOfOperationsAllowed');

      const numberOfOpsInput = ProtocolParameters.maxNumberOfOperationsForNoValueTimeLock;

      ValueTimeLockVerifier.verifyLockAmountAndThrowOnError(undefined, numberOfOpsInput, 12, 'txn writer');
      expect(calcMaxOpsSpy).not.toHaveBeenCalled();
    });

    it('should throw if the lock-owner and transaction-writer do not match', () => {
      const valueTimeLockInput: ValueTimeLockModel = {
        amountLocked: 1234,
        identifier: 'identifier',
        lockTransactionTime: 1234,
        unlockTransactionTime: 1235,
        normalizedFee: 123,
        owner: 'lock-owner'
      };

      const numberOfOpsInput = ProtocolParameters.maxNumberOfOperationsForNoValueTimeLock + 100;

      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () => ValueTimeLockVerifier.verifyLockAmountAndThrowOnError(valueTimeLockInput, numberOfOpsInput, 12, 'txn writer'),
        ErrorCode.ValueTimeLockVerifierTransactionWriterLockOwnerMismatch);
    });

    it('shoud throw if the current block is earlier than the lock start time.', () => {
      const valueTimeLockinput: ValueTimeLockModel = {
        amountLocked: 100,
        identifier: 'identifier',
        lockTransactionTime: 1234,
        unlockTransactionTime: 7890,
        normalizedFee: 200,
        owner: 'owner'
      };

      const numberOfOpsInput = ProtocolParameters.maxNumberOfOperationsForNoValueTimeLock + 100;

      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () =>
          ValueTimeLockVerifier.verifyLockAmountAndThrowOnError(
            valueTimeLockinput,
            numberOfOpsInput,
            valueTimeLockinput.lockTransactionTime - 1,
            valueTimeLockinput.owner),
        ErrorCode.ValueTimeLockVerifierTransactionTimeOutsideLockRange);
    });

    it('shoud throw if the lock is later than the lock end time.', () => {
      const valueTimeLockinput: ValueTimeLockModel = {
        amountLocked: 100,
        identifier: 'identifier',
        lockTransactionTime: 1234,
        unlockTransactionTime: 7890,
        normalizedFee: 200,
        owner: 'owner'
      };

      const numberOfOpsInput = ProtocolParameters.maxNumberOfOperationsForNoValueTimeLock + 100;

      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () =>
          ValueTimeLockVerifier.verifyLockAmountAndThrowOnError(
            valueTimeLockinput,
            numberOfOpsInput,
            valueTimeLockinput.unlockTransactionTime,
            valueTimeLockinput.owner),
        ErrorCode.ValueTimeLockVerifierTransactionTimeOutsideLockRange);
    });

    it('shoud throw if the lock amount is less than the required amount.', () => {
      const mockMaxNumOfOps = 234;
      spyOn(ValueTimeLockVerifier, 'calculateMaxNumberOfOperationsAllowed').and.returnValue(mockMaxNumOfOps);

      const valueTimeLockinput: ValueTimeLockModel = {
        amountLocked: 123,
        identifier: 'identifier',
        lockTransactionTime: 1234,
        unlockTransactionTime: 7890,
        normalizedFee: 200,
        owner: 'owner'
      };

      JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrown(
        () =>
          ValueTimeLockVerifier.verifyLockAmountAndThrowOnError(
            valueTimeLockinput,
            mockMaxNumOfOps + 1,
            valueTimeLockinput.lockTransactionTime + 1,
            valueTimeLockinput.owner),
        ErrorCode.ValueTimeLockVerifierInvalidNumberOfOperations);
    });

    it('shoud not throw if all of the checks pass.', () => {
      const mockMaxNumOfOps = 234;
      spyOn(ValueTimeLockVerifier, 'calculateMaxNumberOfOperationsAllowed').and.returnValue(mockMaxNumOfOps);

      const valueTimeLockinput: ValueTimeLockModel = {
        amountLocked: 123,
        identifier: 'identifier',
        lockTransactionTime: 1234,
        unlockTransactionTime: 7890,
        normalizedFee: 200,
        owner: 'owner'
      };

      ValueTimeLockVerifier.verifyLockAmountAndThrowOnError(
        valueTimeLockinput,
        mockMaxNumOfOps,
        valueTimeLockinput.lockTransactionTime + 1,
        valueTimeLockinput.owner);

      // no exception === no unexpected errors.
    });
  });
});

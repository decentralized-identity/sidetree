import ErrorCode from './ErrorCode';
import ProtocolParameters from './ProtocolParameters';
import SidetreeError from '../../../common/SidetreeError';
import ValueTimeLockModel from '../../../common/models/ValueTimeLockModel';

/**
 * Encapsulates the functionality to compute and verify the value time lock amounts.
 */
export default class ValueTimeLockVerifier {

  /**
   * Calculates the value time lock amount required for the given number of operations.
   *
   * @param numberOfOperations The target number of operations.
   * @param normalizedFee The normalized fee for the given block.
   */
  public static calculateRequiredLockAmount (numberOfOperations: number, normalizedFee: number): number {

    if (numberOfOperations <= this.getMaxNumberOfOpsForZeroLockAmount()) {
      return 0;
    }

    const feePerOperation = normalizedFee * ProtocolParameters.normalizedFeeToPerOperationFeeMultiplier;
    return feePerOperation * numberOfOperations * ProtocolParameters.valueTimeLockAmountMultiplier;
  }

  /**
   * Gets the max number of operations allowed for zero lock amount.
   */
  public static getMaxNumberOfOpsForZeroLockAmount (): number {
    return ProtocolParameters.maxNumberOfOpsForNoValueTimeLock;
  }

  /**
   * Verifies that the value lock object (amount, transaction time range) is correct for the specified number
   * of operations.
   *
   * @param valueTimeLock The value time lock object used for verificiation.
   * @param numberOfOperations The target number of operations.
   * @param normalizedFee The normalized fee for the target block.
   * @param targetTransactionTime The transaction time where the operations were written.
   */
  public static verifyLockAmountAndThrowOnError (
    valueTimeLock: ValueTimeLockModel | undefined,
    numberOfOperations: number,
    normalizedFee: number,
    targetTransactionTime: number): void {

    const requiredLockAmount = this.calculateRequiredLockAmount(numberOfOperations, normalizedFee);

    if (requiredLockAmount === 0) {
      return;
    }

    if (requiredLockAmount > 0 && valueTimeLock === undefined) {
      throw new SidetreeError(ErrorCode.ValueTimeLockRequired, `Required lock amuont: ${requiredLockAmount}`);
    }

    if (targetTransactionTime < valueTimeLock!.lockTransactionTime || targetTransactionTime >= valueTimeLock!.unlockTransactionTime) {
      throw new SidetreeError(
        ErrorCode.ValueTimeLockTargetTransactionTimeOutsideLockRange,
        `Target block: ${targetTransactionTime}; lock start time: ${valueTimeLock!.lockTransactionTime}; unlock time: ${valueTimeLock!.unlockTransactionTime}`);
    }

    if (valueTimeLock!.amountLocked < requiredLockAmount) {
      throw new SidetreeError(
        ErrorCode.ValueTimeLockInsufficentLockAmount,
        `Required lock amount: ${requiredLockAmount}; actual lock amount: ${valueTimeLock!.amountLocked}`);
    }
  }
}

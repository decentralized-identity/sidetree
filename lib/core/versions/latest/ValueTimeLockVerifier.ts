import ErrorCode from './ErrorCode';
import ProtocolParameters from './ProtocolParameters';
import SidetreeError from '../../../common/SidetreeError';
import ValueTimeLockModel from '../../../common/models/ValueTimeLockModel';

/**
 * Encapsulates the functionality to compute and verify the value time lock amounts.
 */
export default class ValueTimeLockVerifier {

  /**
   * Calculates the maximum number of operations allowed to be written for the given lock information. If
   * there is no lock then it returns the number of operations which do not require a lock.
   *
   * @param valueTimeLock The lock object if exists
   * @param normalizedFee The normalized fee for the current block
   */
  public static calculateMaxNumberOfOpsAllowed (valueTimeLock: ValueTimeLockModel | undefined, normalizedFee: number) {

    if (valueTimeLock === undefined) {
      return ProtocolParameters.maxNumberOfOpsForNoValueTimeLock;
    }

    // Using the following formula:
    //  requiredLockAmount = normalizedfee * normalizedFeeMultipier * numberOfOps * valueTimeLockMultiplier
    //
    // We are going to find the numberOfOps given the requiredLockAmount
    const feePerOperation = normalizedFee * ProtocolParameters.normalizedFeeToPerOperationFeeMultiplier;
    const numberOfOpsAllowed = valueTimeLock.amountLocked / (feePerOperation * ProtocolParameters.valueTimeLockAmountMultiplier);

    // Make sure that we are returning an integer; rounding down to make sure that we are not going above 
    // the max limit.
    return Math.floor(numberOfOpsAllowed);
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
    targetTransactionTime: number,
    targetTransactionWriter: string): void {

    if (valueTimeLock) {
      // Check the lock owner
      if (valueTimeLock.owner !== targetTransactionWriter) {
        throw new SidetreeError(
          ErrorCode.ValueTimeLockTransactionWriterLockOwnerMismatch,
          `Transaction writer: ${targetTransactionWriter} - Lock owner: ${valueTimeLock.owner}`);
      }

      // Check the lock duration
      if (targetTransactionTime < valueTimeLock.lockTransactionTime ||
          targetTransactionTime >= valueTimeLock.unlockTransactionTime) {
        throw new SidetreeError(
          ErrorCode.ValueTimeLockTargetTransactionTimeOutsideLockRange,
          `Target block: ${targetTransactionTime}; lock start time: ${valueTimeLock.lockTransactionTime}; unlock time: ${valueTimeLock.unlockTransactionTime}`);
      }
    }

    const maxNumberOfOpsAllowed = this.calculateMaxNumberOfOpsAllowed(valueTimeLock, normalizedFee);

    if (numberOfOperations > maxNumberOfOpsAllowed) {
      throw new SidetreeError(
        ErrorCode.ValueTimeLockInvalidNumberOfOperations,
        `Max number of ops allowed: ${maxNumberOfOpsAllowed}; actual number of ops: ${numberOfOperations}`);
    }
  }
}

/**
 * Provides configuration values for the ValueTimeLock.
 */
export default class ValueTimeLockConfigProvider {

  /**
   * Gets the required lock amount for the given number of operations.
   * @param numberOfOperations The number of operations.
   */
  public static getRequiredLockAmountForOps (numberOfOperations: number): number {
    if (numberOfOperations < 100) {
      return 0;
    }

    return 2000;
  }

  /**
   * Gets the required lock period (in transaction time) for the given number of operations.
   * @param numberOfOperations The number of operaitons.
   */
  public static getRequiredLockTransactionTimeForOps (numberOfOperations: number): number {
    if (numberOfOperations < 100) {
      return 0;
    }

    return 6;
  }
}

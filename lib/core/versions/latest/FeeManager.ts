import ProtocolParameters from './ProtocolParameters';

/**
 * Encapsulates the functionality to calculate and verify the blockchain transaction fees.
 */
export default class FeeManager {

  /**
   * Converts the normalized fee (returned by the blockchain) into the transaction fee to be paid when writing
   * the current transaction.
   *
   * @param normalizedFee The normalized fee for the current transaction.
   * @param numberOfOperations The number of operations to write.
   * @param feeMarkupFactor Markup to be added to the calculated fee.
   *
   * @throws if the number of operations are <= 0.
   */
  public static convertNormalizedFeeToTransactionFee (normalizedFee: number, numberOfOperations: number, feeMarkupFactor: number): number {

    if (numberOfOperations <= 0) {
      throw new Error(`Fee cannot be calculated for the given number of operations: ${numberOfOperations}`);
    }

    const normalizedFeePerOperation = normalizedFee * ProtocolParameters.normalizedToPerOperationFeeFactor;
    const perOperationFee = normalizedFeePerOperation * numberOfOperations;

    // Add some markup to the fee as defined by the caller.
    return perOperationFee + (feeMarkupFactor * perOperationFee);
  }

  /**
   * Verifies that the fee paid for the given transaction is valid; throws if it is not valid.
   *
   * @param feePaid The actual fee paid for that transaction.
   * @param numberOfOperations The number of operations written.
   * @param normalizedFee The normalized fee for that transaction.
   *
   * @throws if the number of operations is <= 0; if the feepaid is invalid.
   */
  public static verifyTransactionFeeAndThrowOnError (feePaid: number, numberOfOperations: number, normalizedFee: number): void {

    // If there are no operations written then someone wrote incorrect data and we are going to throw
    if (numberOfOperations <= 0) {
      throw new Error(`The number of operations input: ${numberOfOperations} must be greater than 0`);
    }

    const actualFeePerOperation = feePaid / numberOfOperations;
    const expectedFeePerOperation = normalizedFee * ProtocolParameters.normalizedToPerOperationFeeFactor;

    if (actualFeePerOperation < expectedFeePerOperation) {
      throw new Error(`The actual fee paid: ${feePaid} per number of operations: ${numberOfOperations} should be at least ${expectedFeePerOperation}.`);
    }
  }
}

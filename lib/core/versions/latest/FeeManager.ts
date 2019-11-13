import ErrorCode from './ErrorCode';
import ProtocolParameters from './ProtocolParameters';
import { SidetreeError } from '../../Error';

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
  public static convertNormalizedFeeToTransactionFee (normalizedFee: number, numberOfOperations: number, feeMarkupPercentage: number): number {

    if (numberOfOperations <= 0) {
      throw new SidetreeError(ErrorCode.OperationCountLessThanZero, `Fee cannot be calculated for the given number of operations: ${numberOfOperations}`);
    }

    const normalizedFeePerOperation = normalizedFee * ProtocolParameters.normalizedToPerOperationFeeFactor;
    const normalizedFeeForAllOperations = normalizedFeePerOperation * numberOfOperations;

    // If our calculated-fee is lower than the normalized fee then the calculated-fee will be ignored by
    // the blockchain miners ... so make sure that we return at-least the normalized fee.
    const transactionFee = Math.max(normalizedFeeForAllOperations, normalizedFee);

    // Add some markup to the fee as defined by the caller.
    const markupToAdd = transactionFee * (feeMarkupPercentage / 100);
    return transactionFee + markupToAdd;
  }

  /**
   * Verifies that the fee paid for the given transaction is valid; throws if it is not valid.
   *
   * @param transactionFeePaid The actual fee paid for that transaction.
   * @param numberOfOperations The number of operations written.
   * @param normalizedFee The normalized fee for that transaction.
   *
   * @throws if the number of operations is <= 0; if the feepaid is invalid.
   */
  public static verifyTransactionFeeAndThrowOnError (transactionFeePaid: number, numberOfOperations: number, normalizedFee: number): void {

    // If there are no operations written then someone wrote incorrect data and we are going to throw
    if (numberOfOperations <= 0) {
      throw new SidetreeError(ErrorCode.OperationCountLessThanZero, `The number of operations: ${numberOfOperations} must be greater than 0`);
    }

    if (transactionFeePaid < normalizedFee) {
      throw new SidetreeError(ErrorCode.TransactionFeePaidLessThanNormalizedFee,
                              `The actual fee paid: ${transactionFeePaid} should be greater than or equal to the normalized fee: ${normalizedFee}`);
    }

    const actualFeePerOperation = transactionFeePaid / numberOfOperations;
    const expectedFeePerOperation = normalizedFee * ProtocolParameters.normalizedToPerOperationFeeFactor;

    if (actualFeePerOperation < expectedFeePerOperation) {
      throw new SidetreeError(
        ErrorCode.TransactionFeePaidInvalid,
        `The actual fee paid: ${transactionFeePaid} per number of operations: ${numberOfOperations} should be at least ${expectedFeePerOperation}.`);
    }
  }
}

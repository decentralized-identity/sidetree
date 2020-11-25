/**
 * Encapsulates the functionality for calculating the fees for blocks.
 */
export default interface IFeeCalculator {
  /**
   * Returns the fee for a particular block height.
   */
  getNormalizedFee (block: number): Promise<number>;
}

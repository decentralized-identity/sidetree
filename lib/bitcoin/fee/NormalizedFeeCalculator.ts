/**
 * Encapsulates the functionality for calculating the normalized fees for blocks.
 */
export default class NormalizedFeeCalculator {

  /**
   * Initializes the Bitcoin processor.
   */
  public async initialize () {
    console.log(`Initializing normalized fee calculator.`);
  }

  /**
   * Return proof-of-fee value for a particular block.
   *
   * @returns The fee if already found and calculated; undeinfed otherwise.
   */
  public getNormalizedFee (_block: number): number | undefined {
    // TODO: Issue #783 - Simplify normalized fee calculation algorithm.
    return 10;
  }
}

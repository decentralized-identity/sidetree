import IFeeCalculator from '../../interfaces/IFeeCalculator';

/**
 * `IFeeCalculator` implementation.
 */
export default class NormalizedFeeCalculator implements IFeeCalculator {

  /**
   * Initializes the Bitcoin processor.
   */
  public async initialize () {
    console.log(`Initializing normalized fee calculator.`);
  }

  public getNormalizedFee (_block: number): number {
    // TODO: Issue #783 - Simplify normalized fee calculation algorithm.
    return 10;
  }
}

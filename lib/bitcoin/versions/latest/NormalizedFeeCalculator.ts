import IBlockMetadataStore from '../../interfaces/IBlockMetadataStore';
import IFeeCalculator from '../../interfaces/IFeeCalculator';

/**
 * `IFeeCalculator` implementation.
 */
export default class NormalizedFeeCalculator implements IFeeCalculator {

  constructor (
    private blockMetadataStore: IBlockMetadataStore,
    private genesisBlockNumber: number,
    private initialNormalizedFee: number,
    private lookBackWindowInterval: number,
    private fluctuationRate: number) {}

  /**
   * Initializes the Bitcoin processor.
   */
  public async initialize () {
    console.log(`Initializing normalized fee calculator.`);
  }

  public async getNormalizedFee (block: number): Promise<number> {
    if (block < this.genesisBlockNumber) {
      // No normalized fee for blocks that exist before genesis
      return 0;
    } else if (block < this.genesisBlockNumber + this.lookBackWindowInterval) {
      // if within look back interval of genesis, use the initial fee
      return this.initialNormalizedFee;
    }

    // look back the interval
    const blocksToAverage = await this.blockMetadataStore.get(block - this.lookBackWindowInterval, block);

    let totalFee = 0;
    let totalTransactionCount = 0;

    for (const blockToAverage of blocksToAverage) {
      totalFee += blockToAverage.totalFee;
      totalTransactionCount += blockToAverage.transactionCount;
    }

    // TODO: #926 investigate potential rounding differences between languages and implemetations
    // https://github.com/decentralized-identity/sidetree/issues/926
    const unadjustedFee = Math.floor(totalFee / totalTransactionCount);

    const previousFee = blocksToAverage[blocksToAverage.length - 1].normalizedFee;

    return this.limitTenPercentPerYear(unadjustedFee, previousFee);
  }

  private limitTenPercentPerYear (unadjustedFee: number, previousFee: number): number {
    const previousFeeAdjustedUp = Math.floor(previousFee * (1 + this.fluctuationRate));
    const previousFeeAdjustedDown = Math.floor(previousFee * (1 - this.fluctuationRate));

    if (unadjustedFee > previousFeeAdjustedUp) {
      return previousFeeAdjustedUp;
    }

    if (unadjustedFee < previousFeeAdjustedDown) {
      return previousFeeAdjustedDown;
    }

    return unadjustedFee;
  }
}

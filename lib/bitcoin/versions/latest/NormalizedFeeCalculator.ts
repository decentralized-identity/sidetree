import BlockMetadata from '../../models/BlockMetadata';
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
    private feeLookBackWindowInBlocks: number,
    private feeMaxFluctuationMultiplierPerBlock: number) {}

  /**
   * Initializes the Bitcoin processor.
   */
  public async initialize () {
    console.log(`Initializing normalized fee calculator.`);
  }

  public async getNormalizedFee (block: number): Promise<number> {
    // DB call optimization
    // https://github.com/decentralized-identity/sidetree/issues/936
    if (block < this.genesisBlockNumber) {
      // No normalized fee for blocks that exist before genesis
      return 0;
    } else if (block < this.genesisBlockNumber + this.feeLookBackWindowInBlocks) {
      // if within look back interval of genesis, use the initial fee
      return this.initialNormalizedFee;
    }

    const blocksToAverage = await this.getLookBackBlocks(block);
    return this.calculateNormalizedFee(blocksToAverage);
  }

  private async getLookBackBlocks (block: number): Promise<BlockMetadata[]> {
    // look back the interval
    return await this.blockMetadataStore.get(block - this.feeLookBackWindowInBlocks, block);
  }

  private calculateNormalizedFee (blocksToAverage: BlockMetadata[]): number {
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
    return this.adjustFeeToWithinFluctuationRate(unadjustedFee, previousFee);
  }

  private adjustFeeToWithinFluctuationRate (unadjustedFee: number, previousFee: number): number {
    const maxAllowedFee = Math.floor(previousFee * (1 + this.feeMaxFluctuationMultiplierPerBlock));
    const minAllowedFee = Math.floor(previousFee * (1 - this.feeMaxFluctuationMultiplierPerBlock));

    if (unadjustedFee > maxAllowedFee) {
      return maxAllowedFee;
    }

    if (unadjustedFee < minAllowedFee) {
      return minAllowedFee;
    }

    return unadjustedFee;
  }
}

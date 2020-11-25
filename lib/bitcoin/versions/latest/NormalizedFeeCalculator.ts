import BlockMetadata from '../../models/BlockMetadata';
import BlockMetadataWithoutNormalizedFee from '../../models/BlockMetadataWithoutNormalizedFee';
import IBlockMetadataStore from '../../interfaces/IBlockMetadataStore';
import IFeeCalculator from '../../interfaces/IFeeCalculator';

/**
 * `IFeeCalculator` implementation.
 */
export default class NormalizedFeeCalculator implements IFeeCalculator {

  private blockMetadataCache: BlockMetadata[];
  private expectedBlockHeight: number | undefined = undefined;
  constructor (
    private blockMetadataStore: IBlockMetadataStore,
    private genesisBlockNumber: number,
    private initialNormalizedFee: number,
    private feeLookBackWindowInBlocks: number,
    private feeMaxFluctuationMultiplierPerBlock: number) {
    this.blockMetadataCache = [];
  }

  /**
   * Initializes the Bitcoin processor.
   */
  public async initialize () {
    console.log(`Initializing normalized fee calculator.`);
  }

  /**
   * This adds normalized fee to the block as it would calculate normalziedFee, but uses a cache to remeber previously seen blocks.
   * Which reduces calls to the metadata store.
   */
  public async addNormalizedFeeToBlock (blockMetadata: BlockMetadataWithoutNormalizedFee): Promise<BlockMetadata> {
    const shouldCalculate = this.shouldCalculateNormalizedFee(blockMetadata.height);
    if (!shouldCalculate.shouldCalculate) {
      return Object.assign({ normalizedFee: shouldCalculate.fee! }, blockMetadata);
    }
    // the cache won't work if the block is not expected, refetch the blocks and store in cache
    if (this.expectedBlockHeight !== blockMetadata.height) {
      this.blockMetadataCache = await this.getLookBackBlocks(blockMetadata.height);
      this.expectedBlockHeight = blockMetadata.height;
    }
    const newFee = this.calculateNormalizedFee(this.blockMetadataCache);
    const newBlockWithFee = Object.assign({ normalizedFee: newFee }, blockMetadata);
    this.blockMetadataCache.push(newBlockWithFee);
    this.blockMetadataCache.shift();
    this.expectedBlockHeight++;
    return newBlockWithFee;
  }

  public async getNormalizedFee (block: number): Promise<number> {
    const shouldCalculate = this.shouldCalculateNormalizedFee(block);
    if (!shouldCalculate.shouldCalculate) {
      return shouldCalculate.fee!;
    }
    const blocksToAverage = await this.getLookBackBlocks(block);
    return this.calculateNormalizedFee(blocksToAverage);
  }

  private shouldCalculateNormalizedFee (block: number): { shouldCalculate: boolean, fee: number | undefined } {
    if (block < this.genesisBlockNumber) {
      // No normalized fee for blocks that exist before genesis
      return { shouldCalculate: false, fee: 0 };
    } else if (block < this.genesisBlockNumber + this.feeLookBackWindowInBlocks) {
      // if within look back interval of genesis, use the initial fee
      return { shouldCalculate: false, fee: this.initialNormalizedFee };
    }
    return { shouldCalculate: true, fee: undefined };
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

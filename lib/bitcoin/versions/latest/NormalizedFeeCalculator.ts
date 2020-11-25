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
  public async addNormalizedFeeToBlockMetadata (blockMetadata: BlockMetadataWithoutNormalizedFee): Promise<BlockMetadata> {
    if (blockMetadata.height < this.genesisBlockNumber + this.feeLookBackWindowInBlocks) {
      return Object.assign({ normalizedFee: this.initialNormalizedFee }, blockMetadata);
    }
    // the cache won't work if the block is not expected, refetch the blocks and store in cache
    if (this.expectedBlockHeight !== blockMetadata.height) {
      this.blockMetadataCache = await this.getBlocksInLookBackWindow(blockMetadata.height);
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
    if (block < this.genesisBlockNumber + this.feeLookBackWindowInBlocks) {
      return this.initialNormalizedFee;
    }
    const blocksToAverage = await this.getBlocksInLookBackWindow(block);
    return this.calculateNormalizedFee(blocksToAverage);
  }

  private async getBlocksInLookBackWindow (block: number): Promise<BlockMetadata[]> {
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

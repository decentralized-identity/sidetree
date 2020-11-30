import BlockMetadata from '../../models/BlockMetadata';
import BlockMetadataWithoutNormalizedFee from '../../models/BlockMetadataWithoutNormalizedFee';
import IBlockMetadataStore from '../../interfaces/IBlockMetadataStore';
import IFeeCalculator from '../../interfaces/IFeeCalculator';

/**
 * `IFeeCalculator` implementation.
 */
export default class NormalizedFeeCalculator implements IFeeCalculator {

  /**
   * A cache to remember blocks in the look-back window for a particular block height
   * which reduces calls to the block metadata store under the most common usage pattern.
   */
  private cachedLookBackWindow: BlockMetadata[];

  /**
   * The block height that the cached look back window is for.
   */
  private blockHeightOfCachedLookBackWindow: number | undefined = undefined;

  constructor (
    private blockMetadataStore: IBlockMetadataStore,
    private genesisBlockNumber: number,
    private initialNormalizedFeeInSatoshis: number,
    private feeLookBackWindowInBlocks: number,
    private feeMaxFluctuationMultiplierPerBlock: number) {
    this.cachedLookBackWindow = [];
  }

  /**
   * Initializes the normalized fee calculator.
   */
  public async initialize () {
    console.log(`Initializing normalized fee calculator.`);
  }

  public async addNormalizedFeeToBlockMetadata (blockMetadata: BlockMetadataWithoutNormalizedFee): Promise<BlockMetadata> {

    // If the height of the given block does not have large enough look-back window, just use initial fee.
    if (blockMetadata.height < this.genesisBlockNumber + this.feeLookBackWindowInBlocks) {
      const blockWithFee = Object.assign({ normalizedFee: this.initialNormalizedFeeInSatoshis }, blockMetadata);

      // We need to push the block metadata into the look-back cache in preparation for when look-back window becomes large enough with the given block height.
      this.cachedLookBackWindow.push(blockWithFee);
      this.blockHeightOfCachedLookBackWindow = blockMetadata.height + 1;

      return blockWithFee;
    }

    // Code reaches here whn the look-back window is large enough.

    // The cache won't work if the block is not the anticipated height, refetch the blocks and store in cache.
    if (this.blockHeightOfCachedLookBackWindow !== blockMetadata.height) {
      this.cachedLookBackWindow = await this.getBlocksInLookBackWindow(blockMetadata.height);
      this.blockHeightOfCachedLookBackWindow = blockMetadata.height;
    }

    const normalizedFee = this.calculateNormalizedFee(this.cachedLookBackWindow);
    const newBlockWithFee = Object.assign({ normalizedFee }, blockMetadata);
    this.cachedLookBackWindow.push(newBlockWithFee);
    this.cachedLookBackWindow.shift();
    this.blockHeightOfCachedLookBackWindow++;
    return newBlockWithFee;
  }

  public async getNormalizedFee (block: number): Promise<number> {
    if (block < this.genesisBlockNumber + this.feeLookBackWindowInBlocks) {
      return this.initialNormalizedFeeInSatoshis;
    }
    const blocksToAverage = await this.getBlocksInLookBackWindow(block);

    const rawNormalizedFee = this.calculateNormalizedFee(blocksToAverage);
    const flooredNormalizedFee = Math.floor(rawNormalizedFee);
    return flooredNormalizedFee;
  }

  private async getBlocksInLookBackWindow (block: number): Promise<BlockMetadata[]> {
    return await this.blockMetadataStore.get(block - this.feeLookBackWindowInBlocks, block);
  }

  private calculateNormalizedFee (blocksToAverage: BlockMetadata[]): number {
    let totalFee = 0;
    let totalTransactionCount = 0;

    for (const blockToAverage of blocksToAverage) {
      totalFee += blockToAverage.totalFee;
      totalTransactionCount += blockToAverage.transactionCount;
    }

    // TODO: #926 investigate potential rounding differences between languages and implementations
    // https://github.com/decentralized-identity/sidetree/issues/926
    const unadjustedFee = totalFee / totalTransactionCount;
    const previousFee = blocksToAverage[blocksToAverage.length - 1].normalizedFee;
    return this.adjustFeeToWithinFluctuationRate(unadjustedFee, previousFee);
  }

  private adjustFeeToWithinFluctuationRate (unadjustedFee: number, previousFee: number): number {
    const maxAllowedFee = previousFee * (1 + this.feeMaxFluctuationMultiplierPerBlock);
    const minAllowedFee = previousFee * (1 - this.feeMaxFluctuationMultiplierPerBlock);

    if (unadjustedFee > maxAllowedFee) {
      return maxAllowedFee;
    }

    if (unadjustedFee < minAllowedFee) {
      return minAllowedFee;
    }

    return unadjustedFee;
  }
}

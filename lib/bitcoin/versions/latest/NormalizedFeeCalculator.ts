import BlockMetadata from '../../models/BlockMetadata';
import BlockMetadataWithoutNormalizedFee from '../../models/BlockMetadataWithoutNormalizedFee';
import ErrorCode from '../../ErrorCode';
import IBlockMetadataStore from '../../interfaces/IBlockMetadataStore';
import IFeeCalculator from '../../interfaces/IFeeCalculator';
import LogColor from '../../../common/LogColor';
import Logger from '../../../common/Logger';
import SidetreeError from '../../../common/SidetreeError';

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
    Logger.info(`Initializing normalized fee calculator.`);
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

    // The cache won't work if the block is not the anticipated height or if required blocks aren't in cache, refetch the blocks and store in cache.
    if (!this.isCacheValid(blockMetadata.height)) {
      this.cachedLookBackWindow = await this.getBlocksInLookBackWindow(blockMetadata.height);
      this.blockHeightOfCachedLookBackWindow = blockMetadata.height;
    }

    const normalizedFee = this.calculateNormalizedFee(this.cachedLookBackWindow);
    const newBlockWithFee = Object.assign({ normalizedFee }, blockMetadata);
    this.cachedLookBackWindow.push(newBlockWithFee);
    this.cachedLookBackWindow.shift();
    this.blockHeightOfCachedLookBackWindow!++;

    Logger.info(LogColor.lightBlue(`Calculated raw normalized fee for block ${LogColor.green(blockMetadata.height)}: ${LogColor.green(normalizedFee)}`));
    return newBlockWithFee;
  }

  public async getNormalizedFee (block: number): Promise<number> {
    // TODO: #943 This is left here because it may be versioned. Move it out if we confirm it will not be versioned.
    // https://github.com/decentralized-identity/sidetree/issues/943
    const blockMetadata = await this.blockMetadataStore.get(block, block + 1);
    if (blockMetadata.length === 0) {
      throw new SidetreeError(ErrorCode.NormalizedFeeCalculatorBlockNotFound);
    }
    return this.calculateNormalizedTransactionFeeFromBlock(blockMetadata[0]);
  }

  public calculateNormalizedTransactionFeeFromBlock (block: BlockMetadata): number {
    return Math.floor(block.normalizedFee);
  }

  private async getBlocksInLookBackWindow (block: number): Promise<BlockMetadata[]> {
    const blockMetadataArray = await this.blockMetadataStore.get(block - this.feeLookBackWindowInBlocks, block);
    return blockMetadataArray;
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

  /**
   * Block height has to be the same as blockHeightOfCachedLookBackWindow
   * because the cache remembers the blocks required to calculate fee for the anticipated block
   * This can fail if fees are asked out of order
   *
   * cachedLookBackWindow.length has to be the same as this.feeLookBackWindowInBlocks
   * because the cache needs the exact same number of blocks as the look back window
   * This can fail if the node dies during slow init before finishing processing through the look back window
   * The cache will have partial data therefore not valid
   *
   * @param blockHeight The current bock height which the normalized fee is asked for
   */
  private isCacheValid (blockHeight: number): boolean {
    return this.blockHeightOfCachedLookBackWindow === blockHeight &&
    this.feeLookBackWindowInBlocks === this.cachedLookBackWindow.length;
  }
}

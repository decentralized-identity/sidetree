import BlockMetadata from '../models/BlockMetadata';
import BlockMetadataWithoutNormalizedFee from '../models/BlockMetadataWithoutNormalizedFee';

/**
 * Encapsulates the functionality for calculating the fees for blocks.
 */
export default interface IFeeCalculator {
  /**
   * Returns the fee for a particular block height.
   */
  getNormalizedFee (block: number): Promise<number>;

  /**
   * Returns the block with normalized fee added
   */
  addNormalizedFeeToBlock (blockMetadataWithoutFee: BlockMetadataWithoutNormalizedFee): Promise<BlockMetadata>;
}

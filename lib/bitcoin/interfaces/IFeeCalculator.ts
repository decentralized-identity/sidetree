import BlockMetadata from '../models/BlockMetadata';
import BlockMetadataWithoutNormalizedFee from '../models/BlockMetadataWithoutNormalizedFee';

/**
 * Encapsulates the functionality for calculating the fees for blocks.
 */
export default interface IFeeCalculator {
  /**
   * Returns the fee in satoshis for a particular block height.
   * @throws SidetreeError with ErrorCode.NormalizedFeeCalculatorBlockNotFound if the block is not observed by the
   * BitcoinProcessor yet
   */
  getNormalizedFee (block: number): Promise<number>;

  /**
   * Perform additional calculation to the raw normalized fee
   * @param blockMetaData The block metadata to calculate fee for
   */
  calculateNormalizedTransactionFeeFromBlock (blockMetaData: BlockMetadata): number;

  /**
   * Returns the block with normalized fee added.
   */
  addNormalizedFeeToBlockMetadata (blockMetadataWithoutFee: BlockMetadataWithoutNormalizedFee): Promise<BlockMetadata>;
}

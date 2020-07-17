import BlockMetadata from '../models/BlockMetadata';

/**
 * An abstraction for the persistence of block metadata.
 */
export default interface IBlockMetadataStore {

  /**
   * Adds the given metadata of blocks to the store. Idempotent operation.
   */
  add (blockMetadata: BlockMetadata[]): Promise<void>;

  /**
   * Removes all the block metadata with height greater than the given height.
   * If no height is given, all data is removed.
   */
  removeLaterThan (blockHeight?: number): Promise<void>;

  /**
   * Gets the metadata of blocks in the specified range is ascending height order.
   */
  get (fromInclusiveHeight: number, toExclusiveHeight: number): Promise<BlockMetadata[]>;

  /**
   * Gets the metadata of the last (largest height) block.
   */
  getLast (): Promise<BlockMetadata | undefined>;

  /**
   * Exponentially look back the blocks starting from the last block (with largest height) until the first block.
   * @returns Exponentially spaced metadata of blocks sorted in height descending order.
   */
  lookBackExponentially (maxHeight: number, minHeight: number): Promise<BlockMetadata[]>;
}

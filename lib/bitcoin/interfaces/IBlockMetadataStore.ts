import BlockMetadata from '../models/BlockMetadata';

/**
 * An abstraction for the persistence of block metadata.
 * Used to avoid re-fetching and reprocessing of transactions when the Sidetree node crashes or restarts.
 */
export default interface IBlockMetadataStore {

  /**
   * Adds the given metadata of blocks to the store.
   */
  addBlockMetadata (blockMetadata: BlockMetadata[]): Promise<void>;

  /**
   * Gets the metadata of blocks in the specified range is ascending height order.
   */
  getBlockMetadata (fromInclusiveHeight: number, toExclusiveHeight: number): Promise<BlockMetadata[]>;
}

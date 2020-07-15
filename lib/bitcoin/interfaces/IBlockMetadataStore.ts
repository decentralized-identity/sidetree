import BlockMetadata from '../models/BlockMetadata';

/**
 * An abstraction for the persistence of block metadata.
 */
export default interface IBlockMetadataStore {

  /**
   * Adds the given metadata of blocks to the store.
   */
  add (blockMetadata: BlockMetadata[]): Promise<void>;

  /**
   * Gets the metadata of blocks in the specified range is ascending height order.
   */
  get (fromInclusiveHeight: number, toExclusiveHeight: number): Promise<BlockMetadata[]>;
}

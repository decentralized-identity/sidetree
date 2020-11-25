import BlockMetadata from '../../lib/bitcoin/models/BlockMetadata';

/**
 * A class that can generate `BlockMetadata`.
 */
export default class BlockMetadataGenerator {
  /**
   * Generates an array of `BlockMetadata`.
   */
  public static generate (count: number): BlockMetadata[] {
    const blocks: BlockMetadata[] = [];
    for (let i = 0; i < count; i++) {
      const block: BlockMetadata = {
        hash: 'anything',
        height: i,
        previousHash: 'anything',
        totalFee: i,
        normalizedFee: i,
        transactionCount: i
      };
      blocks.push(block);
    }

    return blocks;
  }
}

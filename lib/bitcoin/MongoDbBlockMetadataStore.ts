import BlockMetadata from './models/BlockMetadata';
import { Cursor } from 'mongodb';
import IBlockMetadataStore from './interfaces/IBlockMetadataStore';
import MongoDbStore from '../common/MongoDbStore';

/**
 * Implementation of IBlockMetadataStore using MongoDB database.
 */
export default class MongoDbBlockMetadataStore extends MongoDbStore implements IBlockMetadataStore {
  /** Collection name for storing block metadata. */
  public static readonly collectionName = 'blocks';

  /** Query option to exclude `_id` field from being returned. */
  private static readonly optionToExcludeIdField = { fields: { _id: 0 } };

  /**
   * Constructs a `MongoDbBlockMetadataStore`;
   */
  constructor (serverUrl: string, databaseName: string) {
    super(serverUrl, MongoDbBlockMetadataStore.collectionName, databaseName);
  }

  public async createIndex () {
    // Create unique index, so duplicate inserts are rejected.
    await this.collection.createIndex({ height: 1 }, { unique: true });
  }

  public async add (arrayOfBlockMetadata: BlockMetadata[]): Promise<void> {
    const bulkOperations = this.collection!.initializeOrderedBulkOp();

    arrayOfBlockMetadata.sort((a, b) => a.height - b.height);
    for (const blockMetadata of arrayOfBlockMetadata) {
      bulkOperations.find({ height: blockMetadata.height }).upsert().replaceOne(blockMetadata);
    }

    await bulkOperations.execute();
  }

  public async removeLaterThan (blockHeight?: number) {
    // If block height is not given, remove all.
    if (blockHeight === undefined) {
      await this.clearCollection();
      return;
    }

    await this.collection!.deleteMany({ height: { $gt: blockHeight } });
  }

  public async get (fromInclusiveHeight: number, toExclusiveHeight: number): Promise<BlockMetadata[]> {
    let dbCursor: Cursor<BlockMetadata>;

    // Add filter to query.
    dbCursor = this.collection!.find({
      $and: [
        { height: { $gte: fromInclusiveHeight } },
        { height: { $lt: toExclusiveHeight } }
      ]
    });

    // Add sort to query.
    dbCursor = dbCursor.sort({ height: 1 });

    // Execute the query.
    const blocks = await dbCursor.toArray();
    return blocks;
  }

  public async getLast (): Promise<BlockMetadata | undefined> {
    const blocks = await this.collection!.find().sort({ height: -1 }).limit(1).toArray();
    if (blocks.length === 0) {
      return undefined;
    }

    const lastBlockMetadata = blocks[0];
    return lastBlockMetadata;
  }

  /**
   * Gets the first block (block with lowest height).
   */
  private async getFirst (): Promise<BlockMetadata | undefined> {
    const blocks = await this.collection!.find().sort({ height: 1 }).limit(1).toArray();
    if (blocks.length === 0) {
      return undefined;
    }

    const lastBlockMetadata = blocks[0];
    return lastBlockMetadata;
  }

  async lookBackExponentially (): Promise<BlockMetadata[]> {
    const lastBlock = await this.getLast();
    const firstBlock = await this.getFirst();

    if (firstBlock === undefined) {
      return [];
    }

    // Exponentially look back from last block to first block.
    const heightOfBlocksToReturn: number[] = [];
    let lookBackDistance = 1;
    let currentHeight = lastBlock!.height;
    while (currentHeight >= firstBlock.height) {
      heightOfBlocksToReturn.push(currentHeight);

      currentHeight = lastBlock!.height - lookBackDistance;
      lookBackDistance *= 2;
    }

    const exponentiallySpacedBlocks = await this.collection!.find<BlockMetadata>(
      { height: { $in: heightOfBlocksToReturn } },
      MongoDbBlockMetadataStore.optionToExcludeIdField
    ).toArray();
    exponentiallySpacedBlocks.sort((a, b) => b.height - a.height); // Sort in height descending order.

    return exponentiallySpacedBlocks;
  }
}

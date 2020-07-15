import BlockMetadata from './models/BlockMetadata';
import IBlockMetadataStore from './interfaces/IBlockMetadataStore';
import MongoDbStore from './MongoDbStore';
import { Collection, Cursor } from 'mongodb';

/**
 * Implementation of IBlockMetadataStore using MongoDB database.
 */
export default class MongoDbBlockMetadataStore extends MongoDbStore implements IBlockMetadataStore {
  /** Collection name for storing block metadata. */
  public static readonly collectionName = 'blocks';

  /**
   * Constructs a `MongoDbBlockMetadataStore`;
   */
  constructor (serverUrl: string, databaseName?: string) {
    super(serverUrl, MongoDbBlockMetadataStore.collectionName, databaseName);
  }

  protected async createIndex (collection: Collection) {
    // Create unique index, so duplicate inserts are rejected.
    await collection.createIndex({ height: 1 }, { unique: true });
  }

  async add (arrayOfBlockMetadata: BlockMetadata[]): Promise<void> {
    let bulkOperations = this.collection!.initializeUnorderedBulkOp();

    for (const blockMetadata of arrayOfBlockMetadata) {
      bulkOperations.insert(blockMetadata);
    }

    await bulkOperations.execute();
  }

  public async get (fromInclusiveHeight: number, toExclusiveHeight: number): Promise<BlockMetadata[]> {
    let dbCursor: Cursor<BlockMetadata>;

    // Add filter to query.
    dbCursor = this.collection!.find({ $and: [
      { height: { $gte: fromInclusiveHeight } },
      { height: { $lt: toExclusiveHeight } }
    ] });

    // Add sort to query.
    dbCursor = dbCursor.sort({ height: 1 });

    // Execute the query.
    const blocks = await dbCursor.toArray();
    return blocks;
  }
}

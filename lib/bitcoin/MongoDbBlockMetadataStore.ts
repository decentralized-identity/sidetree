import BlockMetadata from './models/BlockMetadata';
import IBlockMetadataStore from './interfaces/IBlockMetadataStore';
import { Collection, Cursor, Db, MongoClient } from 'mongodb';

/**
 * Implementation of IBlockMetadataStore using MongoDB database.
 */
export default class MongoDbBlockMetadataStore implements IBlockMetadataStore {
  /** Default database name used if not specified in constructor. */
  public static readonly defaultDatabaseName: string = 'sidetree';
  /** Collection name for blocks. */
  public static readonly collectionName: string = 'blocks';
  /** Database name used by this block metadata store. */
  public readonly databaseName: string;

  private db: Db | undefined;
  private collection: Collection<BlockMetadata> | undefined;

  /**
   * Constructs a `MongoDbBlockMetadataStore`;
   */
  constructor (private serverUrl: string, databaseName?: string) {
    this.databaseName = databaseName ? databaseName : MongoDbBlockMetadataStore.defaultDatabaseName;
  }

  /**
   * Initialize the MongoDB transaction store.
   */
  public async initialize (): Promise<void> {
    const client = await MongoClient.connect(this.serverUrl, { useNewUrlParser: true }); // `useNewUrlParser` addresses nodejs's URL parser deprecation warning.
    this.db = client.db(this.databaseName);
    this.collection = await MongoDbBlockMetadataStore.createCollectionIfNotExist(this.db);
  }

  /**
   * Clears the store, only used by tests.
   */
  public async clearStore () {
    // NOTE: We avoid implementing this by deleting and recreating the collection in rapid succession,
    // because doing so against some cloud MongoDB services such as CosmosDB,
    // especially in rapid repetition that can occur in tests, will lead to `MongoError: ns not found` connectivity error.
    await this.collection!.deleteMany({ }); // Empty filter removes all entries in collection.
  }

  async addBlockMetadata (arrayOfBlockMetadata: BlockMetadata[]): Promise<void> {
    // NOTE: Must NOT use `initializeUnorderedBulkOp()`,
    // because it will continue to write remainder of the operations in the event of an operation error resulting in unrecoverable data loss.
    let bulkOperations = this.collection!.initializeOrderedBulkOp();

    for (const blockMetadata of arrayOfBlockMetadata) {
      bulkOperations.insert(blockMetadata);
    }

    try {
      await bulkOperations.execute();
    } catch (error) {
      // Swallow duplicate insert errors (error code 11000); rethrow others
      if (error.name !== 'BulkWriteError' || error.code !== 11000) {
        throw error;
      }
    }
  }


  public async getBlockMetadata (fromInclusiveHeight: number, toExclusiveHeight: number): Promise<BlockMetadata[]> {
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

  /**
   * Creates the block metatdata collection with indexes if it does not exists.
   * @returns The existing collection if exists, else the newly created collection.
   */
  private static async createCollectionIfNotExist (db: Db): Promise<Collection<BlockMetadata>> {
    const collections = await db.collections();
    const collectionNames = collections.map(collection => collection.collectionName);

    // If collection exists, use it; else create it.
    let collection;
    if (collectionNames.includes(MongoDbBlockMetadataStore.collectionName)) {
      console.info('Block metadata collection already exists.');
      collection = db.collection(MongoDbBlockMetadataStore.collectionName);
    } else {
      console.info('Block metadata collection does not exists, creating...');
      collection = await db.createCollection(MongoDbBlockMetadataStore.collectionName);

      // Create unique index, so duplicate inserts are rejected.
      await collection.createIndex({ height: 1 }, { unique: true });
      console.info('Block metadata collection created.');
    }

    return collection;
  }
}

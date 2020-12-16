import { Collection, Db, MongoClient } from 'mongodb';
import logger from '../common/Logger';

/**
 * Base class that contains the common MongoDB collection setup.
 */
export default class MongoDbStore {
  /** MondoDB instance. */
  protected db: Db | undefined;
  /** MongoDB collection */
  protected collection: Collection<any> | undefined;

  /**
   * Constructs a `MongoDbStore`;
   */
  constructor (private serverUrl: string, private collectionName: string, private databaseName: string) { }

  /**
   * Initialize the MongoDB transaction store.
   */
  public async initialize (): Promise<void> {
    const client = await MongoClient.connect(this.serverUrl, { useNewUrlParser: true }); // `useNewUrlParser` addresses nodejs's URL parser deprecation warning.
    this.db = client.db(this.databaseName);
    await this.createCollectionIfNotExist(this.db);
  }

  /**
   * Clears the store.
   */
  public async clearCollection () {
    await this.collection!.deleteMany({ }); // Empty filter removes all entries in collection.
  }

  /**
   * Drops the entire collection, only used by tests.
   * NOTE: Avoid dropping and recreating the collection in rapid succession (such as in tests), because:
   * 1. It takes some time (seconds) for the collection be create again.
   * 2. Some cloud MongoDB services such as CosmosDB will lead to `MongoError: ns not found` connectivity error.
   */
  public async dropCollection () {
    await this.collection!.drop();
  }

  /**
   * Creates the collection with indexes if it does not exists.
   */
  private async createCollectionIfNotExist (db: Db): Promise<void> {
    const collections = await db.collections();
    const collectionNames = collections.map(collection => collection.collectionName);

    // If collection exists, use it; else create it.
    let collection;
    if (collectionNames.includes(this.collectionName)) {
      logger.info(`Collection '${this.collectionName}' found.`);
      collection = db.collection(this.collectionName);
    } else {
      logger.info(`Collection '${this.collectionName}' does not exists, creating...`);
      collection = await db.createCollection(this.collectionName);

      await this.createIndex(collection);
      logger.info(`Collection '${this.collectionName}' created.`);
    }

    this.collection = collection;
  }

  /**
   * Create the indices required by the collection passed.
   * To be overriden by inherited classes if needed.
   */
  protected async createIndex (_collection: Collection): Promise<void> {
    logger.info(`Collection '${this.collectionName}' has no index.`);
  }
}

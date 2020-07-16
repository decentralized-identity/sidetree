import IServiceStateStore from './interfaces/IServiceStateStore';
import MongoDbStore from './MongoDbStore';

/**
 * Implementation of IBlockMetadataStore using MongoDB database.
 */
export default class MongoDbServiceStateStore<T> extends MongoDbStore implements IServiceStateStore<T> {
  /** Collection name for storing block metadata. */
  public static readonly collectionName = 'service';

  /**
   * Constructs a `MongoDbServiceStateStore`;
   */
  constructor (serverUrl: string, databaseName?: string) {
    super(serverUrl, MongoDbServiceStateStore.collectionName, databaseName);
  }

  async put (serviceState: T) {
    await this.collection!.replaceOne({ }, serviceState, { upsert: true }); // { } filter results in replacement of the first document returned.
  }

  public async get (): Promise<T | undefined> {
    const queryOptions = { fields: { _id: 0 } }; // Exclude `_id` field from being returned.
    const serviceState = await this.collection!.findOne<T>({ }, queryOptions); //

    if (serviceState === null) {
      return undefined;
    } else {
      return serviceState;
    }
  }
}

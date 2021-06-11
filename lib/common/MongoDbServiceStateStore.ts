import IServiceStateStore from './interfaces/IServiceStateStore';
import MongoDbStore from './MongoDbStore';

/**
 * Implementation of IServiceStateStore using MongoDB database.
 */
export default class MongoDbServiceStateStore<T> extends MongoDbStore implements IServiceStateStore<T> {
  /** Collection name for storing service state. */
  public static readonly collectionName = 'service';

  /**
   * Constructs a `MongoDbServiceStateStore`;
   */
  constructor (serverUrl: string, databaseName: string) {
    super(serverUrl, MongoDbServiceStateStore.collectionName, databaseName);
  }

  async put (serviceState: T) {
    await this.collection!.replaceOne({ }, serviceState, { upsert: true }); // { } filter results in replacement of the first document returned.
  }

  public async get (): Promise<T> {
    const queryOptions = { fields: { _id: 0 } }; // Exclude `_id` field from being returned.
    const serviceState = await this.collection!.findOne({ }, queryOptions);

    return serviceState ? serviceState : { };
  }
}

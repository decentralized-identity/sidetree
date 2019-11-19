import ISlidingWindowQuantileStore from '../interfaces/ISlidingWindowQuantileStore';
import QuantileInfo from '../models/QuantileInfo';
import { Collection, Db, Long, MongoClient } from 'mongodb';

/**
 * MongoDB store for sliding window quantile information.
 */
export default class MongoDbSlidingWindowQuantileStore implements ISlidingWindowQuantileStore {

  private db: Db | undefined;
  private quantileCollection: Collection | undefined;
  private databaseName: string;
  private static readonly quantileCollectionName = 'quantile';
  private static readonly defaultDatabaseName = 'sidetree';

  public constructor (private serverUrl: string, databaseName?: string) {
    this.databaseName = databaseName ? databaseName : MongoDbSlidingWindowQuantileStore.defaultDatabaseName;
  }

  /**
   * Initialize the MongoDB store.
   */
  public async initialize (): Promise<void> {
    const client = await MongoClient.connect(this.serverUrl);
    this.db = client.db(this.databaseName);
    this.quantileCollection = await MongoDbSlidingWindowQuantileStore.createQuantileCollectionIfNotExist(this.db);
  }

  /**
   * Clear all stored state in the quantile store.
   */
  public async clear (): Promise<void> {
    await this.quantileCollection!.deleteMany({});
  }

  /**
   * Store the quantile info for a new group.
   */
  public async put (quantileInfo: QuantileInfo): Promise<void> {
    const quantileInfoInMongoDb = {
      groupId: Long.fromNumber(quantileInfo.groupId),
      quantile: quantileInfo.quantile,
      groupFreqVector: quantileInfo.groupFreqVector
    };

    await this.quantileCollection!.insertOne(quantileInfoInMongoDb);
  }

  /**
   * Retrieve the quantile info for a given groupId
   */
  public async get (groupId: number): Promise<QuantileInfo | undefined> {
    return await this.quantileCollection!.findOne({ groupId: Long.fromNumber(groupId) }) as QuantileInfo;
  }

  /**
   * Get the last groupId stored in the collection.
   */
  public async getLastGroupId (): Promise<number | undefined> {
    const lastGroups = await this.quantileCollection!.find().limit(1).sort({ groupId: -1 }).toArray();
    if (lastGroups.length === 0) {
      return undefined;
    }

    return (lastGroups[0] as QuantileInfo).groupId;
  }

  /** Get the first groupId stored in the collection */
  public async getFirstGroupId (): Promise<number | undefined> {
    const firstGroups = await this.quantileCollection!.find().limit(1).sort({ groupId: 1 }).toArray();
    if (firstGroups.length === 0) {
      return undefined;
    }

    return (firstGroups[0] as QuantileInfo).groupId;
  }

  /** Remove batches with ids greater than or equal to a specified groupId */
  public async removeGroupsGreaterThanEqualTo (groupId: number): Promise<void> {
    await this.quantileCollection!.deleteMany({ groupId: { $gte: Long.fromNumber(groupId) } });
  }

  /**
   * Creates the `quantile` collection with indexes if it does not exists.
   * @returns The existing collection if exists, else the newly created collection.
   */
  private static async createQuantileCollectionIfNotExist (db: Db): Promise<Collection> {
    const collections = await db.collections();
    const collectionNames = collections.map(collection => collection.collectionName);

    if (collectionNames.includes(MongoDbSlidingWindowQuantileStore.quantileCollectionName)) {
      console.info('Quantile collection already exists.');
      return db.collection(MongoDbSlidingWindowQuantileStore.quantileCollectionName);
    } else {
      console.info('Quantile collection does not exists, creating...');
      const quantileCollection = await db.createCollection(MongoDbSlidingWindowQuantileStore.quantileCollectionName);
      await quantileCollection.createIndex({ groupId: 1 }, { unique: true });
      console.info('Quantile collection created.');
      return quantileCollection;
    }
  }
}

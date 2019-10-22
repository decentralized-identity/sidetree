import { Collection, Db, Long, MongoClient } from 'mongodb';

/**
 * Quantile information stored in mongo for each batch.
 */
export interface QuantileInfo {
  batchId: number;
  quantile: number;
  batchFreqVector: number[];
}

/**
 * MongoDB store for sliding window quantile information.
 */
export class SlidingWindowQuantileMongoStore {

  private db: Db | undefined;
  private quantileCollection: Collection | undefined;
  private databaseName: string;
  private static readonly quantileCollectionName = 'quantile';
  private static readonly defaultDatabaseName = 'sidetree';

  public constructor (private serverUrl: string, databaseName?: string) {
    this.databaseName = databaseName ? databaseName : SlidingWindowQuantileMongoStore.defaultDatabaseName;
  }

  /**
   * Initialize the MongoDB store.
   */
  public async initialize (): Promise<void> {
    const client = await MongoClient.connect(this.serverUrl);
    this.db = client.db(this.databaseName);
    this.quantileCollection = await SlidingWindowQuantileMongoStore.createQuantileCollectionIfNotExist(this.db);
  }

  /**
   * Store the quantile info for a new batch.
   */
  public async put (quantileInfo: QuantileInfo): Promise<void> {
    const quantileInfoInMongoDb = {
      batchId: Long.fromNumber(quantileInfo.batchId),
      quantile: quantileInfo.quantile,
      batchFreqVector: quantileInfo.batchFreqVector
    };

    await this.quantileCollection!.insertOne(quantileInfoInMongoDb);
  }

  /**
   * Retrieve the quantile info for a given batchId
   */
  public async get (batchId: number): Promise<QuantileInfo | undefined> {
    return await this.quantileCollection!.findOne({ batchId: Long.fromNumber(batchId) }) as QuantileInfo;
  }

  /**
   * Get the last batchId stored in the collection.
   */
  public async getLastBatchId (): Promise<number | undefined> {
    const lastBatches = await this.quantileCollection!.find().limit(1).sort({ batchId: -1 }).toArray();
    if (lastBatches.length === 0) {
      return undefined;
    }

    return lastBatches[0];
  }

  /** Get the first batchId stored in the collection */
  public async getFirstBatchId (): Promise<number | undefined> {
    const firstBatches = await this.quantileCollection!.find().limit(1).sort({ batchId: 1 }).toArray();
    if (firstBatches.length === 0) {
      return undefined;
    }

    return firstBatches[0];
  }

  /**
   * Creates the `quantile` collection with indexes if it does not exists.
   * @returns The existing collection if exists, else the newly created collection.
   */
  private static async createQuantileCollectionIfNotExist (db: Db): Promise<Collection> {
    const collections = await db.collections();
    const collectionNames = collections.map(collection => collection.collectionName);

    if (collectionNames.includes(SlidingWindowQuantileMongoStore.quantileCollectionName)) {
      console.info('Quantile collection already exists.');
      return db.collection(SlidingWindowQuantileMongoStore.quantileCollectionName);
    } else {
      console.info('Quantile collection does not exists, creating...');
      const quantileCollection = await db.createCollection(SlidingWindowQuantileMongoStore.quantileCollectionName);
      await quantileCollection.createIndex({ batchId: 1 }, { unique: true });
      console.info('Transaction collection created.');
      return quantileCollection;
    }
  }
}

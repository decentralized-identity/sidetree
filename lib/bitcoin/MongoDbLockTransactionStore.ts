import BitcoinLockTransactionModel from './models/BitcoinLockTransactionModel';
import { Collection, Db, Long, MongoClient } from 'mongodb';

/**
 * Encapsulates functionality to store the bitcoin lock information to Db.
 */
export default class MongoDbLockTransactionStore {
  private db: Db | undefined;
  private lockCollection: Collection<any> | undefined;

  /** The collection name */
  public static readonly lockCollectionName = 'locks';

  /**
   * Creates a new instance of this object.
   * @param serverUrl The target server url.
   * @param databaseName The database name where the collection should be saved.
   */
  public constructor (private serverUrl: string, private databaseName: string) {
  }

  /**
   * Initializes this object by creating the required collection.
   */
  public async initialize () {
    const client = await MongoClient.connect(this.serverUrl);
    this.db = client.db(this.databaseName);
    this.lockCollection = await MongoDbLockTransactionStore.creatLockCollectionIfNotExist(this.db);
  }

  /**
   * Adds the specified lock information into the database.
   *
   * @param bitcoinLock The lock information to be added.
   */
  public async addLock (bitcoinLock: BitcoinLockTransactionModel): Promise<void> {
    const lockInMongoDb = {
      transactionId: bitcoinLock.transactionId,
      redeemScript: bitcoinLock.redeemScript,
      // NOTE: MUST force `createTimestamp` to be Int64 in MondoDB.
      createTimestamp: Long.fromNumber(bitcoinLock.createTimestamp),
      type: bitcoinLock.type
    };

    await this.lockCollection!.insertOne(lockInMongoDb);
  }

  /**
   * Clears the store.
   */
  public async clearCollection () {
    await this.lockCollection!.drop();
    this.lockCollection = await MongoDbLockTransactionStore.creatLockCollectionIfNotExist(this.db!);
  }

  /**
   * Gets the latest lock (highest create timestamp) saved in the db; or undefined if nothing saved.
   */
  public async getLastLock (): Promise<BitcoinLockTransactionModel | undefined> {
    const lastLocks = await this.lockCollection!
                            .find()
                            .limit(1)
                            .sort({ createTimestamp: -1 })
                            .toArray();

    if (!lastLocks || lastLocks.length <= 0) {
      return undefined;
    }

    return lastLocks[0] as BitcoinLockTransactionModel;
  }

  private static async creatLockCollectionIfNotExist (db: Db): Promise<Collection<BitcoinLockTransactionModel>> {
    const collections = await db.collections();
    const collectionNames = collections.map(collection => collection.collectionName);

    // If 'transactions' collection exists, use it; else create it.
    let lockCollection;
    if (collectionNames.includes(MongoDbLockTransactionStore.lockCollectionName)) {
      console.info('Locks collection already exists.');
      lockCollection = db.collection(MongoDbLockTransactionStore.lockCollectionName);
    } else {
      console.info('Locks collection does not exists, creating...');
      lockCollection = await db.createCollection(MongoDbLockTransactionStore.lockCollectionName);
      // Note the unique index, so duplicate inserts are rejected.
      await lockCollection.createIndex({ createTimestamp: -1 });
      console.info('Locks collection created.');
    }

    return lockCollection;
  }
}

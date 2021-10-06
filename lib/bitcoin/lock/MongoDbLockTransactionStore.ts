import { Long } from 'mongodb';
import MongoDbStore from '../../common/MongoDbStore';
import SavedLockModel from './../models/SavedLockedModel';

/**
 * Encapsulates functionality to store the bitcoin lock information to Db.
 */
export default class MongoDbLockTransactionStore extends MongoDbStore {
  /** The collection name */
  public static readonly lockCollectionName = 'locks';

  /**
   * Creates a new instance of this object.
   * @param serverUrl The target server url.
   * @param databaseName The database name where the collection should be saved.
   */
  public constructor (
    serverUrl: string,
    databaseName: string) {
    super(serverUrl, MongoDbLockTransactionStore.lockCollectionName, databaseName);
  }

  /**
   * Adds the specified lock information into the database.
   *
   * @param bitcoinLock The lock information to be added.
   */
  public async addLock (bitcoinLock: SavedLockModel): Promise<void> {
    const lockInMongoDb = {
      desiredLockAmountInSatoshis: bitcoinLock.desiredLockAmountInSatoshis,
      transactionId: bitcoinLock.transactionId,
      rawTransaction: bitcoinLock.rawTransaction,
      redeemScriptAsHex: bitcoinLock.redeemScriptAsHex,
      // NOTE: MUST force 'createTimestamp' to be Int64 in MondoDB.
      createTimestamp: Long.fromNumber(bitcoinLock.createTimestamp),
      type: bitcoinLock.type
    };

    await this.collection!.insertOne(lockInMongoDb);
  }

  /**
   * Gets the latest lock (highest create timestamp) saved in the db; or undefined if nothing saved.
   */
  public async getLastLock (): Promise<SavedLockModel | undefined> {
    const lastLocks = await this.collection!
      .find()
      .limit(1)
      .sort({ createTimestamp: -1 })
      .toArray();

    if (!lastLocks || lastLocks.length <= 0) {
      return undefined;
    }

    return lastLocks[0] as SavedLockModel;
  }

  /**
   * @inheritDoc
   */
  public async createIndex (): Promise<void> {
    await this.collection.createIndex({ createTimestamp: -1 });
  }
}

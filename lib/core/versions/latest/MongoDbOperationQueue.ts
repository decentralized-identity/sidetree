import ErrorCode from './ErrorCode';
import IOperationQueue from './interfaces/IOperationQueue';
import { Binary, Collection, MongoClient, Db } from 'mongodb';
import { SidetreeError } from '../../Error';

/**
 * Sidetree operation stored in MongoDb.
 * Note: we use the shorter property name "opIndex" instead of "operationIndex" due to a constraint imposed by CosmosDB/MongoDB:
 * the sum of property names of a unique index keys need to be less than 40 characters.
 * Note: We represent opIndex, transactionNumber, and transactionTime as long instead of number (double) to avoid some floating
 * point comparison quirks.
 */
interface IMongoQueuedOperation {
  didUniqueSuffix: string;
  operationBufferBsonBinary: Binary;
}

/**
 * Operation queue used by the Batch Writer implemented using MongoDB.
 */
export default class MongoDbOperationQueue implements IOperationQueue {
  /** Collection name for queued operations. */
  public static readonly collectionName: string = 'queued-operations';

  private collection: Collection<any> | undefined;

  /**
   * MongoDb database name where the operations are stored
   */
  private databaseName: string = 'sidetree';

  private db: Db | undefined;

  constructor (private serverUrl: string, databaseName?: string) {
    if (databaseName) {
      this.databaseName = databaseName;
    }
  }

  /**
   * Initialize the MongoDB operation store.
   */
  public async initialize () {
    const client = await MongoClient.connect(this.serverUrl);
    this.db = client.db(this.databaseName);
    this.collection = await MongoDbOperationQueue.createCollectionIfNotExist(this.db);
  }

  async enqueue (didUniqueSuffix: string, operationBuffer: Buffer) {
    try {
      const queuedOperation: IMongoQueuedOperation = {
        didUniqueSuffix,
        operationBufferBsonBinary: new Binary(operationBuffer)
      };

      await this.collection!.insertOne(queuedOperation);
    } catch (error) {
      // Duplicate insert errors (error code 11000).
      if (error.code === 11000) {
        throw new SidetreeError(ErrorCode.BatchWriterAlreadyHasOperationForDid);
      }

      throw error;
    }
  }

  async dequeue (count: number): Promise<Buffer[]> {
    if (count <= 0) {
      return [];
    }

    const queuedOperations = await this.collection!.find().sort({ _id : 1 }).limit(count).toArray();
    const lastOperation = queuedOperations[queuedOperations.length - 1];
    await this.collection!.deleteMany({ _id: { $lte: lastOperation._id } });

    return queuedOperations.map((queuedOperation: IMongoQueuedOperation) => queuedOperation.operationBufferBsonBinary.buffer);
  }

  async peek (count: number): Promise<Buffer[]> {
    if (count <= 0) {
      return [];
    }

    // NOTE: `_id` is the default index that is sorted based by create time.
    const queuedOperations = await this.collection!.find().sort({ _id : 1 }).limit(count).toArray();

    return queuedOperations.map((queuedOperation: IMongoQueuedOperation) => queuedOperation.operationBufferBsonBinary.buffer);
  }

  /**
   * Checks to see if the queue already contains an operation for the given DID unique suffix.
   */
  async contains (didUniqueSuffix: string): Promise<boolean> {
    const operations = await this.collection!.find({ didUniqueSuffix }).limit(1).toArray();
    return operations.length > 0;
  }

  /**
   * * Clears the unresolvable transaction store. Mainly used in tests.
   */
  public async clearCollection () {
    await this.collection!.drop();
    this.collection = await MongoDbOperationQueue.createCollectionIfNotExist(this.db!);
  }

  /**
   * Creates the queued operation collection with indexes if it does not exists.
   * @returns The existing collection if exists, else the newly created collection.
   */
  private static async createCollectionIfNotExist (db: Db): Promise<Collection<IMongoQueuedOperation>> {
    // Get the names of existing collections.
    const collections = await db.collections();
    const collectionNames = collections.map(collection => collection.collectionName);

    // If the queued operation collection exists, use it; else create it then use it.
    let collection;
    if (collectionNames.includes(this.collectionName)) {
      collection = db.collection(this.collectionName);
    } else {
      collection = await db.createCollection(this.collectionName);
      // Create an index on didUniqueSuffix make `contains()` operations more efficient.
      // This is an unique index, so duplicate inserts are rejected.
      await collection.createIndex({ didUniqueSuffix: 1 }, { unique: true });
    }

    return collection;
  }
}

import { Binary } from 'mongodb';
import ErrorCode from './ErrorCode';
import IOperationQueue from './interfaces/IOperationQueue';
import MongoDbStore from '../../../common/MongoDbStore';
import QueuedOperationModel from './models/QueuedOperationModel';
import SidetreeError from '../../../common/SidetreeError';

/**
 * Sidetree operation stored in MongoDb.
 * Note: we use the shorter property name "opIndex" instead of "operationIndex" due to a constraint imposed by some MongoDB service such as CosmosDB 3.2:
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
export default class MongoDbOperationQueue extends MongoDbStore implements IOperationQueue {
  /** Collection name for queued operations. */
  public static readonly collectionName: string = 'queued-operations';

  /**
   * Creates a new instance of this object.
   * @param serverUrl The target server url.
   * @param databaseName The database name where the collection should be saved.
   */
  public constructor (
    serverUrl: string,
    databaseName: string) {
    super(serverUrl, MongoDbOperationQueue.collectionName, databaseName);
  }

  /**
   * @inheritDoc
   */
  public async createIndex (): Promise<void> {
    await this.collection.createIndex({ didUniqueSuffix: 1 }, { unique: true });
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

  async dequeue (count: number): Promise<QueuedOperationModel[]> {
    if (count <= 0) {
      return [];
    }

    const queuedOperations = await this.collection!.find().sort({ _id: 1 }).limit(count).toArray();
    const lastOperation = queuedOperations[queuedOperations.length - 1];
    await this.collection!.deleteMany({ _id: { $lte: lastOperation._id } });

    return queuedOperations.map((operation) => MongoDbOperationQueue.convertToQueuedOperationModel(operation));
  }

  async peek (count: number): Promise<QueuedOperationModel[]> {
    if (count <= 0) {
      return [];
    }

    // NOTE: `_id` is the default index that is sorted based by create time.
    const queuedOperations = await this.collection!.find().sort({ _id: 1 }).limit(count).toArray();

    return queuedOperations.map((operation) => MongoDbOperationQueue.convertToQueuedOperationModel(operation));
  }

  /**
   * Checks to see if the queue already contains an operation for the given DID unique suffix.
   */
  async contains (didUniqueSuffix: string): Promise<boolean> {
    const operations = await this.collection!.find({ didUniqueSuffix }).limit(1).toArray();
    return operations.length > 0;
  }

  async getSize (): Promise<number> {
    const size = await this.collection!.estimatedDocumentCount();
    return size;
  }

  private static convertToQueuedOperationModel (mongoQueuedOperation: IMongoQueuedOperation): QueuedOperationModel {
    return {
      didUniqueSuffix: mongoQueuedOperation.didUniqueSuffix,
      operationBuffer: mongoQueuedOperation.operationBufferBsonBinary.buffer
    };
  }
}

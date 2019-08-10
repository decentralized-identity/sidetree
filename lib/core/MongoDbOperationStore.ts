import AnchoredOperationModel from './models/AnchoredOperationModel';
import IOperationStore from './interfaces/IOperationStore';
import NamedAnchoredOperationModel from './models/NamedAnchoredOperationModel';
import { Binary, Collection, Long, MongoClient } from 'mongodb';

/**
 * Sidetree operation stored in MongoDb.
 * Note: we use the shorter property name "opIndex" instead of "operationIndex" due to a constraint imposed by CosmosDB/MongoDB:
 * the sum of property names of a unique index keys need to be less than 40 characters.
 * Note: We represent opIndex, transactionNumber, and transactionTime as long instead of number (double) to avoid some floating
 * point comparison quirks.
 */
interface IMongoOperation {
  didUniqueSuffix: string;
  operationBufferBsonBinary: Binary;
  opIndex: number;
  transactionNumber: Long;
  transactionTime: number;
}

/**
 * Implementation of OperationStore that stores the operation data in
 * a MongoDB database.
 */
export default class MongoDbOperationStore implements IOperationStore {
  private collection: Collection<any> | undefined;

  /**
   * MongoDb database name where the operations are stored
   */
  private readonly databaseName: string;

  /**
   * MongoDB collection name under the database where the operations are stored
   */
  private readonly operationCollectionName: string;

  constructor (
    private serverUrl: string,
    databaseName?: string,
    operationCollectionName?: string
  ) {
    this.databaseName = databaseName ? databaseName : 'sidetree';
    this.operationCollectionName = operationCollectionName ? operationCollectionName : 'operations';
  }

  /**
   * Initialize the MongoDB operation store.
   */
  public async initialize (): Promise<void> {
    const client = await MongoClient.connect(this.serverUrl);
    const db = client.db(this.databaseName);
    const collections = await db.collections();
    const collectionNames = collections.map(collection => collection.collectionName);

    // If the operation collection exists, use it; else create it then use it.
    if (collectionNames.includes(this.operationCollectionName)) {
      this.collection = db.collection(this.operationCollectionName);
    } else {
      this.collection = await db.createCollection(this.operationCollectionName);
      // create an index on didUniqueSuffix, transactionNumber, operationIndex to make get() operations more efficient
      // this is an unique index, so duplicate inserts are rejected.
      await this.collection.createIndex({ didUniqueSuffix: 1, transactionNumber: 1, opIndex: 1 }, { unique: true });
    }
  }

  /**
   * Implement OperationStore.put
   */
  public async put (operations: NamedAnchoredOperationModel[]): Promise<void> {
    let batch = this.collection!.initializeUnorderedBulkOp();

    for (const operation of operations) {
      const mongoOperation = MongoDbOperationStore.convertToMongoOperation(operation);
      batch.insert(mongoOperation);
    }

    try {
      await batch.execute();
    } catch (error) {
      // Swallow duplicate insert errors (error code 11000); rethrow others
      if (error.name !== 'BulkWriteError' || error.code !== 11000) {
        throw error;
      }
    }
  }

  /**
   * Get an iterator that returns all operations with a given
   * didUniqueSuffix ordered by (transactionNumber, operationIndex)
   * ascending.
   */
  public async get (didUniqueSuffix: string): Promise<AnchoredOperationModel[]> {
    const mongoOperations = await this.collection!.find({ didUniqueSuffix }).sort({ transactionNumber: 1, operationIndex: 1 }).toArray();
    return mongoOperations.map((operation) => { return MongoDbOperationStore.convertToAnchoredOperationModel(operation); });
  }

  /**
   * Delete all operations with transaction number greater than the
   * provided parameter.
   */
  public async delete (transactionNumber?: number): Promise<void> {
    if (transactionNumber) {
      await this.collection!.deleteMany({ transactionNumber: { $gt: Long.fromNumber(transactionNumber) } });
    } else {
      await this.collection!.deleteMany({});
    }
  }

  /**
   * Convert a Sidetree operation to a more minimal IMongoOperation object
   * that can be stored on MongoDb. The IMongoOperation object has sufficient
   * information to reconstruct the original operation.
   */
  private static convertToMongoOperation (operation: NamedAnchoredOperationModel): IMongoOperation {
    return {
      didUniqueSuffix: operation.didUniqueSuffix,
      operationBufferBsonBinary: new Binary(operation.operationBuffer),
      opIndex: operation.operationIndex,
      transactionNumber: Long.fromNumber(operation.transactionNumber),
      transactionTime: operation.transactionTime
    };
  }

  /**
   * Convert a MongoDB representation of an operation to a Sidetree operation.
   * Inverse of convertToMongoOperation() method above.
   *
   * Note: mongodb.find() returns an 'any' object that automatically converts longs to numbers -
   * hence the type 'any' for mongoOperation.
   */
  private static convertToAnchoredOperationModel (mongoOperation: any): AnchoredOperationModel {
    return {
      operationBuffer: mongoOperation.operationBufferBsonBinary.buffer,
      operationIndex: mongoOperation.opIndex,
      transactionNumber: mongoOperation.transactionNumber,
      transactionTime: mongoOperation.transactionTime
    };
  }
}

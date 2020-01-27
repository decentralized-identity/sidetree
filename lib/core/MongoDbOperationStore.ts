import IOperationStore from './interfaces/IOperationStore';
import NamedAnchoredOperationModel from './models/NamedAnchoredOperationModel';
import OperationType from './enums/OperationType';
import { Binary, Collection, Long, MongoClient } from 'mongodb';

/**
 * Sidetree operation stored in MongoDb.
 * Note: We use shorter property names such as "opIndex" instead of "operationIndex" to ensure unique index compatibility between MongoDB implementations.
 * Note: We represent txnNumber as long instead of number (double) to ensure large number compatibility
 *       (avoid floating point comparison quirks) between MongoDB implementations.
 */
interface IMongoOperation {
  didSuffix: string;
  operationBufferBsonBinary: Binary;
  opIndex: number;
  txnNumber: Long;
  txnTime: number;
  type: string;
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

  constructor(
    private serverUrl: string,
    databaseName?: string,
    operationCollectionName?: string
  ) {
    this.databaseName = databaseName ? databaseName : 'sidetree';
    this.operationCollectionName = operationCollectionName
      ? operationCollectionName
      : 'operations';
  }

  /**
   * Initialize the MongoDB operation store.
   */
  public async initialize(): Promise<void> {
    const client = await MongoClient.connect(this.serverUrl);
    const db = client.db(this.databaseName);
    const collections = await db.collections();
    const collectionNames = collections.map(
      collection => collection.collectionName
    );

    // If the operation collection exists, use it; else create it then use it.
    if (collectionNames.includes(this.operationCollectionName)) {
      this.collection = db.collection(this.operationCollectionName);
    } else {
      this.collection = await db.createCollection(this.operationCollectionName);
      // create an index on didSuffix, txnNumber, opIndex, and type to make DB operations more efficient.
      // This is an unique index, so duplicate inserts are rejected/ignored.
      await this.collection.createIndex(
        { didSuffix: 1, txnNumber: 1, opIndex: 1, type: 1 },
        { unique: true }
      );
    }
  }

  /**
   * Implement OperationStore.put
   */
  public async put(operations: NamedAnchoredOperationModel[]): Promise<void> {
    let batch = this.collection!.initializeUnorderedBulkOp();

    for (const operation of operations) {
      const mongoOperation = MongoDbOperationStore.convertToMongoOperation(
        operation
      );
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
   * Gets all operations of the given DID unique suffix in ascending chronological order.
   */
  public async get(
    didUniqueSuffix: string
  ): Promise<NamedAnchoredOperationModel[]> {
    const mongoOperations = await this.collection!.find({
      didSuffix: didUniqueSuffix
    })
      .sort({ txnNumber: 1, opIndex: 1 })
      .toArray();
    return mongoOperations.map(operation => {
      return MongoDbOperationStore.convertToAnchoredOperationModel(operation);
    });
  }

  /**
   * Delete all operations with transaction number greater than the
   * provided parameter.
   */
  public async delete(transactionNumber?: number): Promise<void> {
    if (transactionNumber) {
      await this.collection!.deleteMany({
        txnNumber: { $gt: Long.fromNumber(transactionNumber) }
      });
    } else {
      await this.collection!.deleteMany({});
    }
  }

  public async deleteUpdatesEarlierThan(
    didUniqueSuffix: string,
    transactionNumber: number,
    operationIndex: number
  ): Promise<void> {
    await this.collection!.deleteMany({
      $or: [
        {
          didSuffix: didUniqueSuffix,
          txnNumber: { $lt: Long.fromNumber(transactionNumber) },
          type: OperationType.Update
        },
        {
          didSuffix: didUniqueSuffix,
          txnNumber: Long.fromNumber(transactionNumber),
          opIndex: { $lt: operationIndex },
          type: OperationType.Update
        }
      ]
    });
  }

  /**
   * Convert a Sidetree operation to a more minimal IMongoOperation object
   * that can be stored on MongoDb. The IMongoOperation object has sufficient
   * information to reconstruct the original operation.
   */
  private static convertToMongoOperation(
    operation: NamedAnchoredOperationModel
  ): IMongoOperation {
    return {
      type: operation.type,
      didSuffix: operation.didUniqueSuffix,
      operationBufferBsonBinary: new Binary(operation.operationBuffer),
      opIndex: operation.operationIndex,
      txnNumber: Long.fromNumber(operation.transactionNumber),
      txnTime: operation.transactionTime
    };
  }

  /**
   * Convert a MongoDB representation of an operation to a Sidetree operation.
   * Inverse of convertToMongoOperation() method above.
   *
   * Note: mongodb.find() returns an 'any' object that automatically converts longs to numbers -
   * hence the type 'any' for mongoOperation.
   */
  private static convertToAnchoredOperationModel(
    mongoOperation: any
  ): NamedAnchoredOperationModel {
    return {
      type: mongoOperation.type,
      didUniqueSuffix: mongoOperation.didSuffix,
      operationBuffer: mongoOperation.operationBufferBsonBinary.buffer,
      operationIndex: mongoOperation.opIndex,
      transactionNumber: mongoOperation.txnNumber,
      transactionTime: mongoOperation.txnTime
    };
  }
}

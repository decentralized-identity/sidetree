import { Binary, Long } from 'mongodb';
import AnchoredOperationModel from './models/AnchoredOperationModel';
import IOperationStore from './interfaces/IOperationStore';
import MongoDbStore from '../common/MongoDbStore';
import OperationType from './enums/OperationType';

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
export default class MongoDbOperationStore extends MongoDbStore implements IOperationStore {
  /** MongoDB collection name under the database where the operations are stored. */
  public static readonly collectionName: string = 'operations';

  constructor (serverUrl: string, databaseName: string) {
    super(serverUrl, MongoDbOperationStore.collectionName, databaseName);
  }

  public async createIndex () {
    // This is an unique index, so duplicate inserts are rejected/ignored.
    await this.collection.createIndex({ didSuffix: 1, txnNumber: 1, opIndex: 1, type: 1 }, { unique: true });
    // The query in `get()` method needs a corresponding composite index in some cloud-based services (CosmosDB 4.0) that supports MongoDB driver.
    await this.collection.createIndex({ didSuffix: 1, txnNumber: 1, opIndex: 1 }, { unique: true });
    // The query in `get()` method needs a non-composite index on `didSuffix` in some cloud-based services (CosmosDB 4.0) to allow efficient queries.
    await this.collection.createIndex({ didSuffix: 1 }, { unique: false });
  }

  public async insertOrReplace (operations: AnchoredOperationModel[]): Promise<void> {
    const bulkOperations = this.collection!.initializeUnorderedBulkOp();

    for (const operation of operations) {
      const mongoOperation = MongoDbOperationStore.convertToMongoOperation(operation);

      bulkOperations.find({
        didSuffix: operation.didUniqueSuffix,
        txnNumber: operation.transactionNumber,
        opIndex: operation.operationIndex,
        type: operation.type
      }).upsert().replaceOne(mongoOperation);
    }

    await bulkOperations.execute();
  }

  /**
   * Gets all operations of the given DID unique suffix in ascending chronological order.
   */
  public async get (didUniqueSuffix: string): Promise<AnchoredOperationModel[]> {
    const mongoOperations = await this.collection!
      .find({ didSuffix: didUniqueSuffix })
      .sort({ didSuffix: 1, txnNumber: 1, opIndex: 1 })
      .maxTimeMS(MongoDbStore.defaultQueryTimeoutInMilliseconds)
      .toArray();

    return mongoOperations.map((operation) => { return MongoDbOperationStore.convertToAnchoredOperationModel(operation); });
  }

  public async delete (transactionNumber?: number): Promise<void> {
    if (transactionNumber) {
      await this.collection!.deleteMany({ txnNumber: { $gt: Long.fromNumber(transactionNumber) } });
    } else {
      await this.collection!.deleteMany({});
    }
  }

  public async deleteUpdatesEarlierThan (didUniqueSuffix: string, transactionNumber: number, operationIndex: number): Promise<void> {
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
  private static convertToMongoOperation (operation: AnchoredOperationModel): IMongoOperation {
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
  private static convertToAnchoredOperationModel (mongoOperation: any): AnchoredOperationModel {
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

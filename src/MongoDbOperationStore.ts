import { Config, ConfigKey } from './Config';
import { Collection, MongoClient } from 'mongodb';
import { Operation } from './Operation';
import { OperationStore } from './OperationStore';

/**
 * Sidetree operation stored in MongoDb.
 */
interface MongoOperation {
  didUniqueSuffix: string;
  operationBufferBase64: string;
  operationIndex: number;
  transactionNumber: number;
  transactionTime: number;
  batchFileHash: string;
}

/**
 * Implementation of OperationStore that stores the operation data in
 * a MongoDB database.
 */
export class MongoDbOperationStore implements OperationStore {
  private serverUrl: string;
  private collection: Collection<any> | undefined;

  constructor (config: Config) {
    this.serverUrl = config[ConfigKey.OperationStoreUri];
  }

  /**
   * Initialize the MongoDB operation store.
   */
  public async initialize (): Promise<void> {
    const databaseName = 'sidetree';
    const operationCollectionName = 'operations';
    const client = await MongoClient.connect(this.serverUrl);
    const db = client.db(databaseName);
    const collections = await db.collections();
    const collectionNames = collections.map(collection => collection.collectionName);

    // If the operation collection exists, use it; else create it then use it.
    if (collectionNames.includes(operationCollectionName)) {
      this.collection = db.collection(operationCollectionName);
    } else {
      this.collection = await db.createCollection(operationCollectionName);
      await this.collection.createIndex({ didUniqueSuffix: 1, transactionNumber: 1, operationIndex: 1 });
    }
  }

  /**
   * Implement OperationStore.putBatch
   */
  public async putBatch (operations: Array<Operation>): Promise<void> {
    let batch = this.collection!.initializeUnorderedBulkOp();

    for (const operation of operations) {
      const mongoOperation = MongoDbOperationStore.convertToMongoOperation(operation);
      batch.insert(mongoOperation);
    }

    await batch.execute();
  }

  /**
   * Get an iterator that returns all operations with a given
   * didUniqueSuffix ordered by (transactionNumber, operationIndex)
   * ascending.
   */
  public async get (didUniqueSuffix: string): Promise<Iterable<Operation>> {
    const mongoOperations = await this.collection!.find({ didUniqueSuffix }).sort({ transactionNumber: 1, operationIndex: 1 }).toArray();
    return mongoOperations.map(MongoDbOperationStore.convertToOperation);
  }

  /**
   * Delete all operations with transaction number greater than the
   * provided parameter.
   */
  public async delete (transactionNumber?: number): Promise<void> {
    if (transactionNumber) {
      await this.collection!.deleteMany({ transactionNumber: { $gt: transactionNumber } });
    } else {
      await this.collection!.deleteMany({});
    }
  }

  /**
   * Convert a Sidetree operation to a more minimal MongoOperation object
   * that can be stored on MongoDb. The MongoOperation object has sufficient
   * information to reconstruct the original operation.
   */
  private static convertToMongoOperation (operation: Operation): MongoOperation {
    // Convert the operation buffer to string (mongo read-write not handled seamlessly for buffer types)
    const operationBufferBase64Encoding = operation.operationBuffer.toString('base64');

    return {
      didUniqueSuffix: operation.getDidUniqueSuffix(),
      operationBufferBase64: operationBufferBase64Encoding,
      operationIndex: operation.operationIndex!,
      transactionNumber: operation.transactionNumber!,
      transactionTime: operation.transactionTime!,
      batchFileHash: operation.batchFileHash!
    };
  }

  /**
   * Convert a MongoDB representation of an operation to a Sidetree operation.
   * Inverse of convertToMongoOperation() method above.
   */
  private static convertToOperation (mongoOperation: MongoOperation): Operation {
    const operationBuffer: Buffer = Buffer.from(mongoOperation.operationBufferBase64, 'base64');

    return Operation.create(
      operationBuffer,
      {
        transactionNumber: mongoOperation.transactionNumber,
        transactionTime: mongoOperation.transactionTime,
        transactionTimeHash: 'unavailable',
        anchorFileHash: 'unavailable',
        batchFileHash: mongoOperation.batchFileHash
      },
      mongoOperation.operationIndex
    );
  }
}

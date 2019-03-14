import { Config, ConfigKey } from './Config';
import { Collection, Db, MongoClient } from 'mongodb';
import { Operation } from './Operation';
import { OperationStore } from './OperationStore';

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
  private databaseName: string;
  private collectionsName: string;
  private client: MongoClient | undefined;
  private db: Db | undefined;
  private collection: Collection<any> | undefined;

  constructor (config: Config) {
    this.serverUrl = config[ConfigKey.OperationStoreUri];
    this.databaseName = config[ConfigKey.OperationStoreDatabaseName];
    this.collectionsName = config[ConfigKey.OperationStoreCollectionName];
  }

  /**
   * Initialize the MongoDB operation store. The parameter resuming indicates
   * whether the initialization is resuming from a previous stoppage with state
   * stored in the backend mongodb database; if resuming is false, then a new
   * database and collection is created.
   */
  public async initialize (resuming: boolean): Promise<void> {
    this.client = await MongoClient.connect(this.serverUrl);
    this.db = this.client.db(this.databaseName);

    // If we are resuming, then the collection, indexes already exist.
    // Otherwise, we need to create the collection and define an index on
    // (did, transactionNumber, operationIndex), first dropping the collection if
    // it exists.
    if (resuming) {
      this.collection = this.db.collection(this.collectionsName);
    } else {
      await this.db.collection(this.collectionsName).drop();
      this.collection = await this.db.createCollection(this.collectionsName, { strict: false });
      await this.collection.createIndex({ didUniqueSuffix: 1, transactionNumber: 1, operationIndex: 1 });
    }
  }

  /**
   * Implement OperationStore.put.
   */
  public async put (operation: Operation): Promise<void> {

    // Convert the operation buffer to string (mongo read-write not handled seamlessly for buffer types)
    const operationBufferBase64Encoding = operation.operationBuffer.toString('base64');

    const mongoOperation: MongoOperation = {
      didUniqueSuffix: operation.getDidUniqueSuffix(),
      operationBufferBase64: operationBufferBase64Encoding,
      operationIndex: operation.operationIndex!,
      transactionNumber: operation.transactionNumber!,
      transactionTime: operation.transactionTime!,
      batchFileHash: operation.batchFileHash!
    };

    await this.collection!.insertOne(mongoOperation);
  }

  /**
   * Get an iterator that returns all operations with a given
   * didUniqueSuffix ordered by (transactionNumber, operationIndex)
   * ascending.
   */
  public async get (didUniqueSuffix: string): Promise<Iterable<Operation>> {
    const mongoOperations = await this.collection!.find({ didUniqueSuffix }).sort({ transactionNumber: 1, operationIndex: 1 }).toArray();

    return mongoOperations.map((mongoOperation) => {
      const operationBuffer: Buffer = Buffer.from(mongoOperation.operationBufferBase64 as string, 'base64');

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
    });
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
}

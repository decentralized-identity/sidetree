import BatchWriter from './versions/latest/BatchWriter';
import Blockchain from './Blockchain';
import Config from './models/Config';
import MongoDbOperationQueue from './versions/latest/MongoDbOperationQueue';
import MongoDbTransactionStore from '../common/MongoDbTransactionStore';
import VersionManager from './VersionManager';
import TransactionModel from '../common/models/TransactionModel';

/**
 * An class to monitor the Core.
 * NOTE: this class can be completely decoupled from Core, Core does not need this class at all to function.
 */
export default class Monitor {

  private operationQueue: MongoDbOperationQueue;
  private transactionStore!: MongoDbTransactionStore;

  public constructor (private versionManager: VersionManager, private blockchain: Blockchain) {
    this.operationQueue = new MongoDbOperationQueue();
    this.transactionStore = new MongoDbTransactionStore();
  }

  public async initialize (config: Config) {
    await this.transactionStore.initialize(config.mongoDbConnectionString, config.databaseName);
    await this.operationQueue.initialize(config.mongoDbConnectionString, config.databaseName);
  }

  /**
   * Gets the size of the operation queue.
   */
  public async getOperationQueueSize (): Promise<{ operationQueueSize: number}> {
    const operationQueueSize = await this.operationQueue.getSize();

    return { operationQueueSize };
  }

  /**
   * Gets the maximum batch size the writer is currently capable of writing.
   */
  public async getWriterMaxBatchSize (): Promise<{ writerMaxBatchSize: number }> {
    const currentLock = await this.blockchain.getWriterValueTimeLock();
    const writerMaxBatchSize = BatchWriter.getNumberOfOperationsAllowed(this.versionManager, currentLock);

    return { writerMaxBatchSize };
  }

  /**
   * Gets the last processed transaction.
   */
  public async getLastProcessedTransaction (): Promise<TransactionModel | undefined> {
    const lastProcessedTransaction = await this.transactionStore.getLastTransaction();

    return lastProcessedTransaction;
  }
}

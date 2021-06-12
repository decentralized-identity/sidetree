import BatchWriter from './versions/latest/BatchWriter';
import Blockchain from './Blockchain';
import Config from './models/Config';
import MongoDbOperationQueue from './versions/latest/MongoDbOperationQueue';
import MongoDbTransactionStore from '../common/MongoDbTransactionStore';
import TransactionModel from '../common/models/TransactionModel';
import VersionManager from './VersionManager';

/**
 * An class to monitor the Core.
 * NOTE: this class can be completely decoupled from Core, Core does not need this class at all to function.
 */
export default class Monitor {

  private blockchain!: Blockchain;
  private operationQueue: MongoDbOperationQueue;
  private transactionStore: MongoDbTransactionStore;
  private versionManager!: VersionManager;

  public constructor () {
    this.operationQueue = new MongoDbOperationQueue();
    this.transactionStore = new MongoDbTransactionStore();
  }

  public async initialize (config: Config, versionManager: VersionManager, blockchain: Blockchain) {
    this.blockchain = blockchain;
    this.versionManager = versionManager;
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

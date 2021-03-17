import BatchWriter from './versions/latest/BatchWriter';
import Blockchain from './Blockchain';
import Config from './models/Config';
import MongoDbOperationQueue from './versions/latest/MongoDbOperationQueue';
import VersionManager from './VersionManager';

/**
 * An class to monitor the Core.
 * NOTE: this class is completely decoupled from Core, Core does not depend on this class at all for it to function.
 */
export default class Monitor {

  private operationQueue: MongoDbOperationQueue;

  public constructor (private versionManager: VersionManager, private blockchain: Blockchain) {
    this.operationQueue = new MongoDbOperationQueue();
  }

  public async initialize (config: Config) {
    this.operationQueue.initialize(config.mongoDbConnectionString, config.databaseName);
  }

  /**
   * Gets the size of the operation queue.
   */
  public async getOperationQueueSize (): Promise<any> {
    const operationQueueSize = await this.operationQueue.getSize();

    return { operationQueueSize };
  }

  public async getWriterMaxBatchSize (): Promise<any> {
    const currentLock = await this.blockchain.getWriterValueTimeLock();
    const writerMaxBatchSize = BatchWriter.getNumberOfOperationsAllowed(this.versionManager, currentLock);

    return { writerMaxBatchSize };
  }
}

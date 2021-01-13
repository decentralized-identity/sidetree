import MongoDbOperationQueue from './versions/latest/MongoDbOperationQueue';
import Config from './models/Config';

/**
 * An class to monitor the Core.
 * NOTE: this class is completely decoupled from Core, Core does not depend on this class at all for it to function.
 */
export default class Monitor {

  private operationQueue!: MongoDbOperationQueue;

  public async initialize (config: Config) {
    this.operationQueue = new MongoDbOperationQueue(config.mongoDbConnectionString, config.databaseName);

    this.operationQueue.initialize();
  }

  /**
   * Gets the size of the operation queue.
   */
  public async getOperationQueueSize (): Promise<number> {
    const queueSize = await this.operationQueue.getSize();
    return queueSize;
  }
}

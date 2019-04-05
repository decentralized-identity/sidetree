import DownloadManager from './DownloadManager';
import MongoDbOperationStore from './MongoDbOperationStore';
import Observer from './Observer';
import OperationProcessor from './OperationProcessor';
import RequestHandler from './RequestHandler';
import Rooter from './Rooter';
import { BlockchainClient } from './Blockchain';
import { CasClient } from './Cas';
import { Config, ConfigKey } from './Config';

/**
 * The core class that is instantiated when running a Sidetree node.
 */
export default class Core {
  private operationStore: MongoDbOperationStore;
  private observer: Observer;

  /**
   * Operation and resolve request handler.
   */
  public requestHandler: RequestHandler;

  /**
   * Core constructor.
   */
  public constructor (config: Config) {
    // Component dependency initialization & injection.
    const blockchain = new BlockchainClient(config[ConfigKey.BlockchainNodeUri]);
    const cas = new CasClient(config[ConfigKey.CasNodeUri]);
    const downloadManager = new DownloadManager(+config[ConfigKey.MaxConcurrentCasDownloads], cas);
    const rooter = new Rooter(blockchain, cas, +config[ConfigKey.BatchIntervalInSeconds]);
    this.operationStore = new MongoDbOperationStore(config[ConfigKey.OperationStoreUri]);
    const operationProcessor = new OperationProcessor(config[ConfigKey.DidMethodName], this.operationStore);
    this.observer = new Observer(blockchain, downloadManager, operationProcessor, +config[ConfigKey.PollingIntervalInSeconds]);
    this.requestHandler = new RequestHandler(operationProcessor, blockchain, rooter, config[ConfigKey.DidMethodName]);

    downloadManager.start();
    rooter.startPeriodicRooting();
  }

  /**
   * The initialization method that must be called before consumption of this core object.
   * The method starts the Observer and Batch Writer.
   */
  public async initialize () {
    await this.operationStore.initialize();
    await this.observer.startPeriodicProcessing();
  }
}

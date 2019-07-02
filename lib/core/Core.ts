import BatchWriter from './BatchWriter';
import DownloadManager from './DownloadManager';
import IConfig from './IConfig';
import MongoDbOperationQueue from './MongoDbOperationQueue';
import MongoDbOperationStore from './MongoDbOperationStore';
import MongoDbTransactionStore from '../common/MongoDbTransactionStore';
import MongoDbUnresolvableTransactionStore from './MongoDbUnresolvableTransactionStore';
import Observer from './Observer';
import OperationProcessor from './OperationProcessor';
import ProtocolParameters, { IProtocolParameters } from './ProtocolParameters';
import RequestHandler from './RequestHandler';
import { BlockchainClient } from './Blockchain';
import { CasClient } from './Cas';

/**
 * The core class that is instantiated when running a Sidetree node.
 */
export default class Core {
  private transactionStore: MongoDbTransactionStore;
  private unresolvableTransactionStore: MongoDbUnresolvableTransactionStore;
  private operationStore: MongoDbOperationStore;
  private operationQueue: MongoDbOperationQueue;
  private blockchain: BlockchainClient;
  private observer: Observer;
  private batchWriter: BatchWriter;

  /**
   * Operation and resolve request handler.
   */
  public requestHandler: RequestHandler;

  /**
   * Core constructor.
   */
  public constructor (config: IConfig, versionsOfProtocolParameters: IProtocolParameters[]) {
    ProtocolParameters.initialize(versionsOfProtocolParameters);

    // Component dependency initialization & injection.
    this.blockchain = new BlockchainClient(config.blockchainServiceUri);
    const cas = new CasClient(config.contentAddressableStoreServiceUri);
    const downloadManager = new DownloadManager(config.maxConcurrentDownloads, cas);
    this.operationQueue = new MongoDbOperationQueue(config.mongoDbConnectionString);
    this.batchWriter = new BatchWriter(this.blockchain, cas, config.batchingIntervalInSeconds, this.operationQueue);
    this.operationStore = new MongoDbOperationStore(config.mongoDbConnectionString);
    const operationProcessor = new OperationProcessor(config.didMethodName, this.operationStore);
    this.requestHandler = new RequestHandler(operationProcessor, this.blockchain, this.batchWriter, config.didMethodName);
    this.transactionStore = new MongoDbTransactionStore(config.mongoDbConnectionString);
    this.unresolvableTransactionStore = new MongoDbUnresolvableTransactionStore(config.mongoDbConnectionString);
    this.observer = new Observer(this.blockchain,
                                 downloadManager,
                                 operationProcessor,
                                 this.transactionStore,
                                 this.unresolvableTransactionStore,
                                 config.observingIntervalInSeconds);

    downloadManager.start();
  }

  /**
   * The initialization method that must be called before consumption of this core object.
   * The method starts the Observer and Batch Writer.
   */
  public async initialize () {
    await this.operationQueue.initialize();
    await this.transactionStore.initialize();
    await this.unresolvableTransactionStore.initialize();
    await this.operationStore.initialize();
    await this.blockchain.initialize();

    await this.observer.startPeriodicProcessing();
    this.batchWriter.startPeriodicBatchWriting();
    this.blockchain.startPeriodicCachedBlockchainTimeRefresh();
  }
}

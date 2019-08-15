import BatchScheduler from './BatchScheduler';
import Blockchain from './Blockchain';
import Cas from './Cas';
import DownloadManager from './DownloadManager';
import Config from './models/Config';
import MongoDbOperationStore from './MongoDbOperationStore';
import MongoDbTransactionStore from '../common/MongoDbTransactionStore';
import MongoDbUnresolvableTransactionStore from './MongoDbUnresolvableTransactionStore';
import Observer from './Observer';
import Resolver from './Resolver';
import VersionManager, { IProtocolVersion } from './VersionManager';
import { ResponseModel } from '../common/Response';

/**
 * The core class that is instantiated when running a Sidetree node.
 */
export default class Core {
  private transactionStore: MongoDbTransactionStore;
  private unresolvableTransactionStore: MongoDbUnresolvableTransactionStore;
  private operationStore: MongoDbOperationStore;
  private versionManager: VersionManager;
  private blockchain: Blockchain;
  private cas: Cas;
  private downloadManager: DownloadManager;
  private observer: Observer;
  private batchScheduler: BatchScheduler;
  private resolver: Resolver;

  /**
   * Core constructor.
   */
  public constructor (config: Config, protocolVersions: IProtocolVersion[]) {
    // Component dependency construction & injection.
    this.versionManager = new VersionManager(config, protocolVersions); // `VersionManager` is first constructed component.
    this.operationStore = new MongoDbOperationStore(config.mongoDbConnectionString);
    this.blockchain = new Blockchain(config.blockchainServiceUri);
    this.cas = new Cas(config.contentAddressableStoreServiceUri);
    this.downloadManager = new DownloadManager(config.maxConcurrentDownloads, this.cas);
    this.resolver = new Resolver((blockchainTime) => this.versionManager.getOperationProcessor(blockchainTime), this.operationStore);
    this.batchScheduler = new BatchScheduler(
      (blockchainTime) => this.versionManager.getBatchWriter(blockchainTime), this.blockchain, config.batchingIntervalInSeconds);
    this.transactionStore = new MongoDbTransactionStore(config.mongoDbConnectionString);
    this.unresolvableTransactionStore = new MongoDbUnresolvableTransactionStore(config.mongoDbConnectionString);
    this.observer = new Observer(
      (blockchainTime) => this.versionManager.getTransactionProcessor(blockchainTime),
      this.blockchain,
      config.maxConcurrentDownloads,
      this.operationStore,
      this.transactionStore,
      this.unresolvableTransactionStore,
      config.observingIntervalInSeconds
    );

    this.downloadManager.start();
  }

  /**
   * The initialization method that must be called before consumption of this core object.
   * The method starts the Observer and Batch Writer.
   */
  public async initialize () {
    await this.transactionStore.initialize();
    await this.unresolvableTransactionStore.initialize();
    await this.operationStore.initialize();
    await this.blockchain.initialize();
    await this.versionManager.initialize(
      this.blockchain,
      this.cas,
      this.downloadManager,
      this.operationStore,
      this.resolver
    ); // `VersionManager` is last initialized component.

    await this.observer.startPeriodicProcessing();
    this.batchScheduler.startPeriodicBatchWriting();
    this.blockchain.startPeriodicCachedBlockchainTimeRefresh();
  }

  /**
   * Handles an operation request.
   */
  public async handleOperationRequest (request: Buffer): Promise<ResponseModel> {
    const currentTime = this.blockchain.approximateTime;
    const requestHandler = this.versionManager.getRequestHandler(currentTime.time);
    const response = requestHandler.handleOperationRequest(request);
    return response;
  }

  /**
   * Handles resolve operation.
   * @param didOrDidDocument Can either be:
   *   1. Fully qualified DID. e.g. 'did:sidetree:abc' or
   *   2. An encoded DID Document prefixed by the DID method name. e.g. 'did:sidetree:<encoded-DID-Document>'.
   */
  public async handleResolveRequest (didOrDidDocument: string): Promise<ResponseModel> {
    const currentTime = this.blockchain.approximateTime;
    const requestHandler = this.versionManager.getRequestHandler(currentTime.time);
    const response = requestHandler.handleResolveRequest(didOrDidDocument);
    return response;
  }
}

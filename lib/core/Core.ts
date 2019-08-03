import BatchScheduler from './BatchScheduler';
import DownloadManager from './DownloadManager';
import IConfig from './interfaces/IConfig';
import MongoDbOperationQueue from './MongoDbOperationQueue';
import MongoDbOperationStore from './MongoDbOperationStore';
import MongoDbTransactionStore from '../common/MongoDbTransactionStore';
import MongoDbUnresolvableTransactionStore from './MongoDbUnresolvableTransactionStore';
import Observer from './Observer';
import VersionManager, { IProtocolVersion } from './VersionManager';
import { BlockchainClient } from './Blockchain';
import { CasClient } from './Cas';
import { IResponse } from '../common/Response';

/**
 * The core class that is instantiated when running a Sidetree node.
 */
export default class Core {
  private transactionStore: MongoDbTransactionStore;
  private unresolvableTransactionStore: MongoDbUnresolvableTransactionStore;
  private operationStore: MongoDbOperationStore;
  private operationQueue: MongoDbOperationQueue;
  private versionManager: VersionManager;
  private blockchain: BlockchainClient;
  private observer: Observer;
  private batchScheduler: BatchScheduler;

  /**
   * Core constructor.
   */
  public constructor (config: IConfig, protocolVersions: IProtocolVersion[]) {
    // Component dependency initialization & injection.
    this.blockchain = new BlockchainClient(config.blockchainServiceUri);
    const cas = new CasClient(config.contentAddressableStoreServiceUri);
    const downloadManager = new DownloadManager(config.maxConcurrentDownloads, cas);
    this.operationQueue = new MongoDbOperationQueue(config.mongoDbConnectionString);
    this.versionManager = new VersionManager(config, protocolVersions, downloadManager);
    this.batchScheduler = new BatchScheduler(
      (blockchainTime) => this.versionManager.getBatchWriter(blockchainTime), this.blockchain, config.batchingIntervalInSeconds);
    this.transactionStore = new MongoDbTransactionStore(config.mongoDbConnectionString);
    this.unresolvableTransactionStore = new MongoDbUnresolvableTransactionStore(config.mongoDbConnectionString);
    this.operationStore = new MongoDbOperationStore(
      config.mongoDbConnectionString,
      (blockchainTime) => this.versionManager.getHashAlgorithmInMultihashCode(blockchainTime)
    );
    this.observer = new Observer(
      (blockchainTime) => this.versionManager.getHashAlgorithmInMultihashCode(blockchainTime),
      (blockchainTime) => this.versionManager.getTransactionProcessor(blockchainTime),
      this.blockchain,
      downloadManager,
      this.operationStore,
      this.transactionStore,
      this.unresolvableTransactionStore,
      config.observingIntervalInSeconds
    );

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
    await this.versionManager.initialize();

    await this.observer.startPeriodicProcessing();
    this.batchScheduler.startPeriodicBatchWriting();
    this.blockchain.startPeriodicCachedBlockchainTimeRefresh();
  }

  /**
   * Handles an operation request.
   */
  public async handleOperationRequest (request: Buffer): Promise<IResponse> {
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
  public async handleResolveRequest (didOrDidDocument: string): Promise<IResponse> {
    const currentTime = this.blockchain.approximateTime;
    const requestHandler = this.versionManager.getRequestHandler(currentTime.time);
    const response = requestHandler.handleResolveRequest(didOrDidDocument);
    return response;
  }
}

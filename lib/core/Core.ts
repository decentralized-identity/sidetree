import * as semver from 'semver';
import * as timeSpan from 'time-span';
import { ISidetreeCas, ISidetreeEventEmitter, ISidetreeLogger } from '..';
import BatchScheduler from './BatchScheduler';
import Blockchain from './Blockchain';
import BlockchainClock from './BlockchainClock';
import Config from './models/Config';
import DownloadManager from './DownloadManager';
import ErrorCode from './ErrorCode';
import EventEmitter from '../common/EventEmitter';
import LogColor from '../common/LogColor';
import Logger from '../common/Logger';
import MongoDbConfirmationStore from './MongoDbConfirmationStore';
import MongoDbOperationStore from './MongoDbOperationStore';
import MongoDbServiceStateStore from '../common/MongoDbServiceStateStore';
import MongoDbTransactionStore from '../common/MongoDbTransactionStore';
import MongoDbUnresolvableTransactionStore from './MongoDbUnresolvableTransactionStore';
import Monitor from './Monitor';
import Observer from './Observer';
import Resolver from './Resolver';
import ResponseModel from '../common/models/ResponseModel';
import ResponseStatus from '../common/enums/ResponseStatus';
import ServiceInfo from '../common/ServiceInfoProvider';
import ServiceStateModel from './models/ServiceStateModel';
import SidetreeError from '../common/SidetreeError';
import VersionManager from './VersionManager';
import VersionModel from './models/VersionModel';

/**
 * The core class that is instantiated when running a Sidetree node.
 */
export default class Core {
  /** Monitor of the running Core service. */
  public monitor: Monitor;

  private serviceStateStore: MongoDbServiceStateStore<ServiceStateModel>;
  private transactionStore: MongoDbTransactionStore;
  private unresolvableTransactionStore: MongoDbUnresolvableTransactionStore;
  private operationStore: MongoDbOperationStore;
  private versionManager: VersionManager;
  private blockchain: Blockchain;
  private downloadManager: DownloadManager;
  private observer: Observer;
  private batchScheduler: BatchScheduler;
  private resolver: Resolver;
  private serviceInfo: ServiceInfo;
  private blockchainClock: BlockchainClock;
  private confirmationStore: MongoDbConfirmationStore;

  /**
   * Core constructor.
   */
  public constructor (private config: Config, versionModels: VersionModel[], private cas: ISidetreeCas) {
    // Component dependency construction & injection.
    this.versionManager = new VersionManager(config, versionModels); // `VersionManager` is first constructed component as multiple components depend on it.
    this.serviceInfo = new ServiceInfo('core');
    this.serviceStateStore = new MongoDbServiceStateStore(this.config.mongoDbConnectionString, this.config.databaseName);
    this.operationStore = new MongoDbOperationStore(config.mongoDbConnectionString, config.databaseName);
    this.blockchain = new Blockchain(config.blockchainServiceUri);
    this.downloadManager = new DownloadManager(config.maxConcurrentDownloads, this.cas);
    this.resolver = new Resolver(this.versionManager, this.operationStore);
    this.transactionStore = new MongoDbTransactionStore(config.mongoDbConnectionString, config.databaseName);
    this.unresolvableTransactionStore = new MongoDbUnresolvableTransactionStore(config.mongoDbConnectionString, config.databaseName);
    this.confirmationStore = new MongoDbConfirmationStore(config.mongoDbConnectionString, config.databaseName);

    // Only enable real blockchain time pull if observer is enabled
    const enableRealBlockchainTimePull = config.observingIntervalInSeconds > 0;
    this.blockchainClock = new BlockchainClock(this.blockchain, this.serviceStateStore, enableRealBlockchainTimePull);

    this.batchScheduler = new BatchScheduler(this.versionManager, this.blockchain, config.batchingIntervalInSeconds);
    this.observer = new Observer(
      this.versionManager,
      this.blockchain,
      config.maxConcurrentDownloads,
      this.operationStore,
      this.transactionStore,
      this.unresolvableTransactionStore,
      this.confirmationStore,
      config.observingIntervalInSeconds
    );

    this.monitor = new Monitor(this.config, this.versionManager, this.blockchain);
  }

  /**
   * The initialization method that must be called before consumption of this core object.
   * The method starts the Observer and Batch Writer.
   */
  public async initialize (customLogger?: ISidetreeLogger, customEventEmitter?: ISidetreeEventEmitter) {
    Logger.initialize(customLogger);
    EventEmitter.initialize(customEventEmitter);

    // DB initializations.
    await this.serviceStateStore.initialize();
    await this.transactionStore.initialize();
    await this.unresolvableTransactionStore.initialize();
    await this.operationStore.initialize();
    await this.confirmationStore.initialize();
    await this.upgradeDatabaseIfNeeded();

    await this.versionManager.initialize(
      this.blockchain,
      this.cas,
      this.downloadManager,
      this.operationStore,
      this.resolver,
      this.transactionStore,
      this.confirmationStore
    ); // `VersionManager` is last initialized component as it needs many shared/common components to be ready first.

    if (this.config.observingIntervalInSeconds > 0) {
      await this.observer.startPeriodicProcessing();
    } else {
      Logger.warn(LogColor.yellow(`Transaction observer is disabled.`));
    }

    // Only pull real blockchain time when observer is enabled, else only read from db.
    await this.blockchainClock.startPeriodicPullLatestBlockchainTime();

    if (this.config.batchingIntervalInSeconds > 0) {
      this.batchScheduler.startPeriodicBatchWriting();
    } else {
      Logger.warn(LogColor.yellow(`Batch writing is disabled.`));
    }

    this.downloadManager.start();

    await this.monitor.initialize();
  }

  /**
   * Handles an operation request.
   */
  public async handleOperationRequest (request: Buffer): Promise<ResponseModel> {
    const currentTime = this.blockchainClock.getTime()!;
    const requestHandler = this.versionManager.getRequestHandler(currentTime);
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
    const currentTime = this.blockchainClock.getTime()!;
    const requestHandler = this.versionManager.getRequestHandler(currentTime);
    const response = requestHandler.handleResolveRequest(didOrDidDocument);
    return response;
  }

  /**
   * Handles the get version request. It gets the versions from the dependent services
   * as well.
   */
  public async handleGetVersionRequest (): Promise<ResponseModel> {
    const responses = [
      this.serviceInfo.getServiceVersion(),
      await this.blockchain.getServiceVersion()
    ];

    return {
      status: ResponseStatus.Succeeded,
      body: JSON.stringify(responses)
    };
  }

  private async upgradeDatabaseIfNeeded () {
    // If this node is not the active Observer node, do not perform DB upgrade.
    // Since only one active Observer is supported, this ensures only one node is performing the DB upgrade.
    if (this.config.observingIntervalInSeconds === 0) {
      return;
    }

    const expectedDbVersion = '1.1.0';
    const savedServiceState = await this.serviceStateStore.get();
    const actualDbVersion = savedServiceState.databaseVersion;

    if (expectedDbVersion === actualDbVersion) {
      return;
    }

    // Throw if attempting to downgrade.
    if (actualDbVersion !== undefined && semver.lt(expectedDbVersion, actualDbVersion)) {
      Logger.error(
        LogColor.red(`Downgrading DB from version ${LogColor.green(actualDbVersion)} to  ${LogColor.green(expectedDbVersion)} is not allowed.`)
      );
      throw new SidetreeError(ErrorCode.DatabaseDowngradeNotAllowed);
    }

    // Add DB upgrade code below.

    Logger.warn(LogColor.yellow(`Upgrading DB from version ${LogColor.green(actualDbVersion)} to ${LogColor.green(expectedDbVersion)}...`));

    // Current upgrade action is simply clearing/deleting existing DB such that initial sync can occur from genesis block.
    const timer = timeSpan();
    await this.operationStore.delete();
    await this.transactionStore.clearCollection();
    await this.unresolvableTransactionStore.clearCollection();

    // There was a index change/addition in from v1.0.0 -> v1.0.1 of the DB, this line ensures new indices are created,
    // but can be optional in the future when v1.0.0 is so old that we don't care about upgrade path from it.
    await this.operationStore.createIndex();

    await this.serviceStateStore.put({ databaseVersion: expectedDbVersion });

    Logger.warn(LogColor.yellow(`DB upgraded in: ${LogColor.green(timer.rounded())} ms.`));
  }
}

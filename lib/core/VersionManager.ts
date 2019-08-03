import BatchWriter from './interfaces/BatchWriter';
import DownloadManager from './DownloadManager';
import IConfig from './interfaces/IConfig';
import IOperationProcessor from './interfaces/IOperationProcessor';
import IVersionInfo from './interfaces/IVersionInfo';
import MongoDbOperationQueue from './MongoDbOperationQueue';
import MongoDbOperationStore from './MongoDbOperationStore';
import RequestHandler from './interfaces/RequestHandler';
import Resolver from './Resolver';
import TransactionProcessor from './interfaces/TransactionProcessor';
import { BlockchainClient } from './Blockchain';
import { CasClient } from './Cas';

/**
 * Defines a protocol version and its starting blockchain time.
 */
export interface IProtocolVersion {
  /** The inclusive starting logical blockchain time that this protocol applies to. */
  startingBlockchainTime: number;
  version: string;
}

/**
 * The class that handles the loading of different versions of protocol codebase.
 */
export default class VersionManager {
  // Reverse sorted protocol versions. ie. latest version first.
  private protocolVersionsReverseSorted: IProtocolVersion[];

  private batchWriters: Map<string, BatchWriter>;
  private operationProcessors: Map<string, IOperationProcessor>;
  private requestHandlers: Map<string, RequestHandler>;
  private transactionProcessors: Map<string, TransactionProcessor>;
  private versionInfos: Map<string, IVersionInfo>;

  // Cached list of supported hash algorithms.
  private allSupportedHashAlgorithms: number[] = [];

  public constructor (
    private config: IConfig,
    protocolVersions: IProtocolVersion[],
    private downloadManager: DownloadManager) {

    // Reverse sort protocol versions.
    this.protocolVersionsReverseSorted = protocolVersions.sort((a, b) => b.startingBlockchainTime - a.startingBlockchainTime);

    this.batchWriters = new Map();
    this.operationProcessors = new Map();
    this.requestHandlers = new Map();
    this.transactionProcessors = new Map();
    this.versionInfos = new Map();
  }

  /**
   * Loads all the versions of the protocol codebase.
   */
  public async initialize () {

    // TODO: Need to revisit these to also move them into versioned codebase.
    const operationQueue = new MongoDbOperationQueue(this.config.mongoDbConnectionString);
    await operationQueue.initialize();

    const operationStore = new MongoDbOperationStore(
      this.config.mongoDbConnectionString, (blockchainTime) => this.getHashAlgorithmInMultihashCode(blockchainTime));
    await operationStore.initialize();

    const blockchain = new BlockchainClient(this.config.blockchainServiceUri);
    await blockchain.initialize();

    const cas = new CasClient(this.config.contentAddressableStoreServiceUri);
    const resolver = new Resolver((blockchainTime) => this.getOperationProcessor(blockchainTime), operationStore);

    // Load all the metadata on all protocol versions first because instantiation of other components will need it.
    for (const protocolVersion of this.protocolVersionsReverseSorted) {
      const version = protocolVersion.version;

      /* tslint:disable-next-line */
      const VersionInfo = (await import(`./versions/${version}/VersionInfo`)).default;
      const versionInfo = new VersionInfo();
      this.versionInfos.set(version, versionInfo);
    }

    // Get and cache supported hash algorithms.
    this.allSupportedHashAlgorithms = Array.from(this.versionInfos.values(), value => value.hashAlgorithmInMultihashCode);
    this.allSupportedHashAlgorithms = Array.from(new Set(this.allSupportedHashAlgorithms)); // This line removes duplicates.

    // Instantiate rest of the protocol components.
    // NOTE: In principal each version of the interface implemtnations can have different constructors,
    // but we currently keep the constructor signature the same as much as possible for simple instance construction,
    // but it is not inhernetly "bad" if we have to have conditional constructions for each if we have to.
    for (const protocolVersion of this.protocolVersionsReverseSorted) {
      const version = protocolVersion.version;

      /* tslint:disable-next-line */
      const VersionInfo = (await import(`./versions/${version}/VersionInfo`)).default;
      const versionInfo = new VersionInfo();
      this.transactionProcessors.set(version, versionInfo);

      /* tslint:disable-next-line */
      const TransactionProcessor = (await import(`./versions/${version}/TransactionProcessor`)).default;
      const transactionProcessor = new TransactionProcessor(this.allSupportedHashAlgorithms, this.downloadManager, operationStore);
      this.transactionProcessors.set(version, transactionProcessor);

      /* tslint:disable-next-line */
      const BatchWriter = (await import(`./versions/${version}/BatchWriter`)).default;
      const batchWriter = new BatchWriter(
        operationQueue, blockchain, cas, this.allSupportedHashAlgorithms, (blockchainTime: number) => this.getHashAlgorithmInMultihashCode(blockchainTime));
      this.batchWriters.set(version, batchWriter);

      /* tslint:disable-next-line */
      const OperationProcessor = (await import(`./versions/${version}/OperationProcessor`)).default;
      const operationProcessor = new OperationProcessor(this.config.didMethodName);
      this.operationProcessors.set(version, operationProcessor);

      /* tslint:disable-next-line */
      const RequestHandler = (await import(`./versions/${version}/RequestHandler`)).default;
      const requestHandler = new RequestHandler(resolver, blockchain, operationQueue, this.config.didMethodName, this.allSupportedHashAlgorithms);
      this.requestHandlers.set(version, requestHandler);
    }
  }
  /**
   * Gets the list of hash algorithms supported across all versions of the protocol.
   */
  public getSupportedHashAlgorithms (): number[] {
    return this.allSupportedHashAlgorithms;
  }

  /**
   * Gets the corresponding version of the `BatchWriter` based on the given blockchain time.
   */
  public getBatchWriter (blockchainTime: number): BatchWriter {
    const version = this.getVersionString(blockchainTime);
    const batchWriter = this.batchWriters.get(version);

    if (batchWriter === undefined) {
      throw new Error(`Unabled to find batch writer for the given blockchain time ${blockchainTime}, investigate and fix.`);
    }

    return batchWriter;
  }

  /**
   * Gets the hash algorithm used based on the given blockchain time.
   */
  public getHashAlgorithmInMultihashCode (blockchainTime: number): number {
    const version = this.getVersionString(blockchainTime);
    const versionInfo = this.versionInfos.get(version);

    if (versionInfo === undefined) {
      throw new Error(`Unabled to find hash algorithm for the given blockchain time ${blockchainTime}, investigate and fix.`);
    }

    return versionInfo.hashAlgorithmInMultihashCode;
  }

  /**
   * Gets the corresponding version of the `IOperationProcessor` based on the given blockchain time.
   */
  public getOperationProcessor (blockchainTime: number): IOperationProcessor {
    const version = this.getVersionString(blockchainTime);
    const operationProcessor = this.operationProcessors.get(version);

    if (operationProcessor === undefined) {
      throw new Error(`Unabled to find operation processor for the given blockchain time ${blockchainTime}, investigate and fix.`);
    }

    return operationProcessor;
  }

  /**
   * Gets the corresponding version of the `IRequestHandler` based on the given blockchain time.
   */
  public getRequestHandler (blockchainTime: number): RequestHandler {
    const version = this.getVersionString(blockchainTime);
    const requestHandler = this.requestHandlers.get(version);

    if (requestHandler === undefined) {
      throw new Error(`Unabled to find request handler for the given blockchain time ${blockchainTime}, investigate and fix.`);
    }

    return requestHandler;
  }

  /**
   * Gets the corresponding version of the `TransactionProcessor` based on the given blockchain time.
   */
  public getTransactionProcessor (blockchainTime: number): TransactionProcessor {
    const version = this.getVersionString(blockchainTime);
    const transactionProcessor = this.transactionProcessors.get(version);

    if (transactionProcessor === undefined) {
      throw new Error(`Unabled to find transaction processor for the given blockchain time ${blockchainTime}, investigate and fix.`);
    }

    return transactionProcessor;
  }

  /**
   * Gets the corresponding protocol version string given the blockchain time.
   */
  private getVersionString (blockchainTime: number): string {
    // Iterate through each version to find the right version.
    for (const protocolVersion of this.protocolVersionsReverseSorted) {
      if (blockchainTime >= protocolVersion.startingBlockchainTime) {
        return protocolVersion.version;
      }
    }

    throw new Error(`Unabled to find protocol parameters for the given blockchain time ${blockchainTime}, investigate and fix.`);
  }
}

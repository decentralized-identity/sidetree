import DownloadManager from './DownloadManager';
import IBatchWriter from './interfaces/IBatchWriter';
import IBlockchain from './interfaces/IBlockchain';
import ICas from './interfaces/ICas';
import Config from './models/Config';
import IOperationProcessor from './interfaces/IOperationProcessor';
import IOperationStore from './interfaces/IOperationStore';
import IRequestHandler from './interfaces/IRequestHandler';
import ITransactionProcessor from './interfaces/ITransactionProcessor';
import ProtocolVersionMetadata from './models/ProtocolVersionMetadata';
import Resolver from './Resolver';
import IVersionManager from "./interfaces/IVersionManager";

/**
 * Defines a protocol version and its starting blockchain time.
 */
export interface ProtocolVersionModel {
  /** The inclusive starting logical blockchain time that this protocol applies to. */
  startingBlockchainTime: number;
  version: string;
}

/**
 * The class that handles the loading of different versions of protocol codebase.
 */
export default class VersionManager implements IVersionManager {
  // Reverse sorted protocol versions. ie. latest version first.
  private protocolVersionsReverseSorted: ProtocolVersionModel[];

  private batchWriters: Map<string, IBatchWriter>;
  private operationProcessors: Map<string, IOperationProcessor>;
  private requestHandlers: Map<string, IRequestHandler>;
  private transactionProcessors: Map<string, ITransactionProcessor>;
  private protocolVersionMetadatas: Map<string, ProtocolVersionMetadata>;

  public constructor (
    private config: Config,
    protocolVersions: ProtocolVersionModel[]
  ) {

    // Reverse sort protocol versions.
    this.protocolVersionsReverseSorted = protocolVersions.sort((a, b) => b.startingBlockchainTime - a.startingBlockchainTime);

    this.batchWriters = new Map();
    this.operationProcessors = new Map();
    this.requestHandlers = new Map();
    this.transactionProcessors = new Map();
    this.protocolVersionMetadatas = new Map();
  }

  /**
   * Loads all the versions of the protocol codebase.
   */
  public async initialize (
    blockchain: IBlockchain,
    cas: ICas,
    downloadManager: DownloadManager,
    operationStore: IOperationStore,
    resolver: Resolver
  ) {

    // Load all the metadata on all protocol versions first because instantiation of other components will need it.
    for (const protocolVersion of this.protocolVersionsReverseSorted) {
      const version = protocolVersion.version;
      const protocolVersionMetadata = (await import(`./versions/${version}/ProtocolVersionMetadata`)).default;
      this.protocolVersionMetadatas.set(version, protocolVersionMetadata);
    }

    // Get and cache supported hash algorithms.
    let allSupportedHashAlgorithms = Array.from(this.protocolVersionMetadatas.values(), value => value.hashAlgorithmInMultihashCode);
    allSupportedHashAlgorithms = Array.from(new Set(allSupportedHashAlgorithms)); // This line removes duplicates.

    // Instantiate rest of the protocol components.
    // NOTE: In principal each version of the interface implemtnations can have different constructors,
    // but we currently keep the constructor signature the same as much as possible for simple instance construction,
    // but it is not inhernetly "bad" if we have to have conditional constructions for each if we have to.
    for (const protocolVersion of this.protocolVersionsReverseSorted) {
      const version = protocolVersion.version;

      /* tslint:disable-next-line */
      const MongoDbOperationQueue = (await import(`./versions/${version}/MongoDbOperationQueue`)).default;
      const operationQueue = new MongoDbOperationQueue(this.config.mongoDbConnectionString);
      await operationQueue.initialize();

      /* tslint:disable-next-line */
      const TransactionProcessor = (await import(`./versions/${version}/TransactionProcessor`)).default;
      const transactionProcessor = new TransactionProcessor(downloadManager, operationStore);
      this.transactionProcessors.set(version, transactionProcessor);

      /* tslint:disable-next-line */
      const BatchWriter = (await import(`./versions/${version}/BatchWriter`)).default;
      const batchWriter = new BatchWriter(operationQueue, blockchain, cas);
      this.batchWriters.set(version, batchWriter);

      /* tslint:disable-next-line */
      const OperationProcessor = (await import(`./versions/${version}/OperationProcessor`)).default;
      const operationProcessor = new OperationProcessor(this.config.didMethodName);
      this.operationProcessors.set(version, operationProcessor);

      /* tslint:disable-next-line */
      const RequestHandler = (await import(`./versions/${version}/RequestHandler`)).default;
      const requestHandler = new RequestHandler(resolver, operationQueue, this.config.didMethodName, allSupportedHashAlgorithms);
      this.requestHandlers.set(version, requestHandler);
    }
  }

  /**
   * Gets the corresponding version of the `IBatchWriter` based on the given blockchain time.
   */
  public getBatchWriter (blockchainTime: number): IBatchWriter {
    const version = this.getVersionString(blockchainTime);
    const batchWriter = this.batchWriters.get(version);

    if (batchWriter === undefined) {
      throw new Error(`Unabled to find batch writer for the given blockchain time ${blockchainTime}, investigate and fix.`);
    }

    return batchWriter;
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
  public getRequestHandler (blockchainTime: number): IRequestHandler {
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
  public getTransactionProcessor (blockchainTime: number): ITransactionProcessor {
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

import TransactionProcessor from './interfaces/TransactionProcessor';
import DownloadManager from './DownloadManager';
import OperationStore from './interfaces/OperationStore';

/**
 * Defines the list of protocol parameters.
 */
export interface IProtocolVersion {
  /** The inclusive starting logical blockchain time that this protocol applies to. */
  startingBlockchainTime: number;
  version: string;
}

/**
 * The classes that handels the loading of different versions of protocol codebase.
 */
export default class VersionManager {
  // Reverse sorted protocol versions. ie. latest version first.
  private protocolVersionsReverseSorted: IProtocolVersion[];

  private transactionProcessors: Map<string, TransactionProcessor>;

  public constructor (protocolVersions: IProtocolVersion[], private downloadManager: DownloadManager, private operationStore: OperationStore) {
    // Reverse sort protocol versions.
    this.protocolVersionsReverseSorted = protocolVersions.sort((a, b) => b.startingBlockchainTime - a.startingBlockchainTime);

    this.transactionProcessors = new Map();
  }

  /**
   * Loads all the versions of the protocol codebase.
   */
  public async initialize () {
    for (const protocolVersion of this.protocolVersionsReverseSorted) {
      const version = protocolVersion.version;

      const transactionProcessorClass = (await import(`./versions/${version}/TransactionProcessor`)).default;
      const transactionProcessor = new transactionProcessorClass(this.downloadManager, this.operationStore);
      this.transactionProcessors.set(version, transactionProcessor);
    }
  }

  /**
   * Gets the corresponding version of the `TransactionProcessor` based on the transaction time.
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

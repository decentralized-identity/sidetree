import * as semver from 'semver';
import * as timeSpan from 'time-span';
import { ISidetreeEventEmitter, ISidetreeLogger } from '..';
import BitcoinBlockDataIterator from './BitcoinBlockDataIterator';
import BitcoinBlockModel from './models/BitcoinBlockModel';
import BitcoinClient from './BitcoinClient';
import BitcoinServiceStateModel from './models/BitcoinServiceStateModel';
import BitcoinTransactionModel from './models/BitcoinTransactionModel';
import BitcoinVersionModel from './models/BitcoinVersionModel';
import BlockMetadata from './models/BlockMetadata';
import BlockMetadataWithoutNormalizedFee from './models/BlockMetadataWithoutNormalizedFee';
import ErrorCode from './ErrorCode';
import EventCode from './EventCode';
import EventEmitter from '../common/EventEmitter';
import IBitcoinConfig from './IBitcoinConfig';
import LockMonitor from './lock/LockMonitor';
import LockResolver from './lock/LockResolver';
import LogColor from '../common/LogColor';
import Logger from '../common/Logger';
import MongoDbBlockMetadataStore from './MongoDbBlockMetadataStore';
import MongoDbLockTransactionStore from './lock/MongoDbLockTransactionStore';
import MongoDbServiceStateStore from '../common/MongoDbServiceStateStore';
import MongoDbTransactionStore from '../common/MongoDbTransactionStore';
import Monitor from './Monitor';
import RequestError from './RequestError';
import ResponseStatus from '../common/enums/ResponseStatus';
import ServiceInfoProvider from '../common/ServiceInfoProvider';
import ServiceVersionModel from '../common/models/ServiceVersionModel';
import SharedErrorCode from '../common/SharedErrorCode';
import SidetreeError from '../common/SidetreeError';
import SidetreeTransactionParser from './SidetreeTransactionParser';
import SpendingMonitor from './SpendingMonitor';
import TransactionFeeModel from '../common/models/TransactionFeeModel';
import TransactionModel from '../common/models/TransactionModel';
import TransactionNumber from './TransactionNumber';
import ValueTimeLockModel from '../common/models/ValueTimeLockModel';
import VersionManager from './VersionManager';

/**
 * Object representing a blockchain time and hash
 */
export interface IBlockchainTime {
  /** The logical blockchain time */
  time: number;
  /** The hash associated with the blockchain time */
  hash: string;
}

/**
 * Data structure containing block height and hash.
 */
export interface IBlockInfo {
  /** Block height. */
  height: number;
  /** Block hash. */
  hash: string;
  /** Previous block hash. */
  previousHash: string;
}

/**
 * Processor for Bitcoin REST API calls
 */
export default class BitcoinProcessor {

  /** The first Sidetree block in Bitcoin's blockchain. */
  public readonly genesisBlockNumber: number;

  /** Monitor of the running Bitcoin service. */
  public monitor: Monitor;

  /** Store for the state of sidetree transactions. */
  private readonly transactionStore: MongoDbTransactionStore;

  private versionManager: VersionManager;

  /** Last seen block */
  private lastProcessedBlock: BlockMetadata | undefined;

  /** Poll timeout identifier */
  private pollTimeoutId: number | undefined;

  private serviceInfoProvider: ServiceInfoProvider;

  private bitcoinClient: BitcoinClient;

  private spendingMonitor: SpendingMonitor;

  private serviceStateStore: MongoDbServiceStateStore<BitcoinServiceStateModel>;

  private blockMetadataStore: MongoDbBlockMetadataStore;

  private mongoDbLockTransactionStore: MongoDbLockTransactionStore;

  private lockResolver: LockResolver;

  private lockMonitor: LockMonitor;

  private sidetreeTransactionParser: SidetreeTransactionParser;

  /** at least 100 blocks per page unless reaching the last block */
  private static readonly pageSizeInBlocks = 100;

  public constructor (private config: IBitcoinConfig) {
    this.versionManager = new VersionManager();

    this.genesisBlockNumber = config.genesisBlockNumber;

    this.serviceStateStore = new MongoDbServiceStateStore(config.mongoDbConnectionString, config.databaseName);
    this.blockMetadataStore = new MongoDbBlockMetadataStore(config.mongoDbConnectionString, config.databaseName);
    this.transactionStore = new MongoDbTransactionStore(config.mongoDbConnectionString, config.databaseName);

    this.spendingMonitor = new SpendingMonitor(config.bitcoinFeeSpendingCutoffPeriodInBlocks,
      BitcoinClient.convertBtcToSatoshis(config.bitcoinFeeSpendingCutoff),
      this.transactionStore);

    this.serviceInfoProvider = new ServiceInfoProvider('bitcoin');

    this.bitcoinClient =
      new BitcoinClient(
        config.bitcoinPeerUri,
        config.bitcoinRpcUsername,
        config.bitcoinRpcPassword,
        config.bitcoinWalletOrImportString,
        config.requestTimeoutInMilliseconds || 300,
        config.requestMaxRetries || 3,
        config.sidetreeTransactionFeeMarkupPercentage || 0,
        config.defaultTransactionFeeInSatoshisPerKB);

    this.sidetreeTransactionParser = new SidetreeTransactionParser(this.bitcoinClient, this.config.sidetreeTransactionPrefix);

    this.lockResolver =
      new LockResolver(
        this.versionManager,
        this.bitcoinClient);

    this.mongoDbLockTransactionStore = new MongoDbLockTransactionStore(config.mongoDbConnectionString, config.databaseName);

    // TODO: #988 Can potentially remove the default. If removed, the config will be required and more explicit but user can set bad values (0).
    // https://github.com/decentralized-identity/sidetree/issues/988
    const valueTimeLockTransactionFeesInBtc = config.valueTimeLockTransactionFeesAmountInBitcoins === undefined ? 0.25
      : config.valueTimeLockTransactionFeesAmountInBitcoins;

    this.lockMonitor = new LockMonitor(
      this.bitcoinClient,
      this.mongoDbLockTransactionStore,
      this.lockResolver,
      config.valueTimeLockPollPeriodInSeconds,
      config.valueTimeLockUpdateEnabled,
      BitcoinClient.convertBtcToSatoshis(config.valueTimeLockAmountInBitcoins), // Desired lock amount in satoshis
      BitcoinClient.convertBtcToSatoshis(valueTimeLockTransactionFeesInBtc),    // Txn Fees amount in satoshis
      this.versionManager
    );

    this.monitor = new Monitor(this.bitcoinClient);
  }

  /**
   * Initializes the Bitcoin processor
   */
  public async initialize (versionModels: BitcoinVersionModel[], customLogger?: ISidetreeLogger, customEventEmitter?: ISidetreeEventEmitter) {
    Logger.initialize(customLogger);
    EventEmitter.initialize(customEventEmitter);

    await this.versionManager.initialize(versionModels, this.config, this.blockMetadataStore);
    await this.serviceStateStore.initialize();
    await this.blockMetadataStore.initialize();
    await this.transactionStore.initialize();
    await this.bitcoinClient.initialize();
    await this.mongoDbLockTransactionStore.initialize();

    await this.upgradeDatabaseIfNeeded();

    // Only observe transactions if polling is enabled.
    if (this.config.transactionPollPeriodInSeconds > 0) {

      // Current implementation records processing progress at block increments using `this.lastProcessedBlock`,
      // so we need to trim the databases back to the last fully processed block.
      this.lastProcessedBlock = await this.blockMetadataStore.getLast();

      const startingBlock = await this.getStartingBlockForPeriodicPoll();

      if (startingBlock === undefined) {
        Logger.info('Bitcoin processor state is ahead of Bitcoin Core, skipping initialization...');
      } else {
        Logger.info('Synchronizing blocks for sidetree transactions...');
        Logger.info(`Starting block: ${startingBlock.height} (${startingBlock.hash})`);
        if (this.config.bitcoinDataDirectory) {
          // This reads into the raw block files and parse to speed up the initial startup instead of rpc
          await this.fastProcessTransactions(startingBlock);
        } else {
          await this.processTransactions(startingBlock);
        }
      }

      // Intentionally not await on the promise.
      this.periodicPoll();
    } else {
      Logger.warn(LogColor.yellow(`Transaction observer is disabled.`));
    }

    // NOTE: important to start lock monitor polling AFTER we have processed all the blocks above (for the case that this node is observing transactions),
    // this is because that the lock monitor depends on lock resolver, and lock resolver currently needs the normalized fee calculator,
    // even though lock monitor itself does not depend on normalized fee calculator.
    await this.lockMonitor.startPeriodicProcessing();
  }

  private async upgradeDatabaseIfNeeded () {
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
    await this.blockMetadataStore.clearCollection();
    await this.transactionStore.clearCollection();

    await this.serviceStateStore.put({ databaseVersion: expectedDbVersion });

    Logger.warn(LogColor.yellow(`DB upgraded in: ${LogColor.green(timer.rounded())} ms.`));
  }

  /**
   * A faster version of process transactions that requires access to bitcoin data directory
   * @param startingBlock the starting block to begin processing
   */
  private async fastProcessTransactions (startingBlock: IBlockInfo) {
    const bitcoinBlockDataIterator = new BitcoinBlockDataIterator(this.config.bitcoinDataDirectory!);
    const lastBlockHeight = await this.bitcoinClient.getCurrentBlockHeight();
    const lastBlockInfo = await this.bitcoinClient.getBlockInfoFromHeight(lastBlockHeight);

    // Use the model without normalized fee here because fast processing cannot derive normalized fee until all blocks are gathered.
    // a map of all blocks mapped with their hash being the key
    const notYetValidatedBlocks: Map<string, BlockMetadataWithoutNormalizedFee> = new Map();
    // An array of blocks representing the validated chain reverse sorted by height
    const validatedBlocks: BlockMetadataWithoutNormalizedFee[] = [];

    Logger.info(`Begin fast processing block ${startingBlock.height} to ${lastBlockHeight}`);
    // Loop through files backwards and process blocks from the end/tip of the blockchain until we reach the starting block given.
    let hashOfEarliestKnownValidBlock = lastBlockInfo.hash;
    let heightOfEarliestKnownValidBlock = lastBlockInfo.height;
    while (bitcoinBlockDataIterator.hasPrevious() && heightOfEarliestKnownValidBlock >= startingBlock.height) {
      const blocks = bitcoinBlockDataIterator.previous()!;
      await this.processBlocks(blocks, notYetValidatedBlocks, startingBlock.height, heightOfEarliestKnownValidBlock);
      this.findEarliestValidBlockAndAddToValidBlocks(
        validatedBlocks,
        notYetValidatedBlocks,
        hashOfEarliestKnownValidBlock,
        startingBlock.height);
      if (validatedBlocks.length > 0) {
        heightOfEarliestKnownValidBlock = validatedBlocks[validatedBlocks.length - 1].height - 1;
        hashOfEarliestKnownValidBlock = validatedBlocks[validatedBlocks.length - 1].previousHash;
      }
    }

    // at this point, all the blocks in notYetValidatedBlocks are for sure not valid because we've filled the valid blocks with the ones we want
    await this.removeTransactionsInInvalidBlocks(notYetValidatedBlocks);

    // Write the block metadata to DB.
    const timer = timeSpan(); // Start timer to measure time taken to write block metadata.

    // ValidatedBlocks are in descending order, this flips that and make it ascending by height for the purpose of normalized fee calculation
    const validatedBlocksOrderedByHeight = validatedBlocks.reverse();
    await this.writeBlocksToMetadataStoreWithFee(validatedBlocksOrderedByHeight);
    Logger.info(`Inserted metadata of ${validatedBlocks.length} blocks to DB. Duration: ${timer.rounded()} ms.`);
    Logger.info('finished fast processing');
  }

  private async processBlocks (
    blocks: BitcoinBlockModel[],
    notYetValidatedBlocks: Map<string, BlockMetadataWithoutNormalizedFee>,
    startingBlockHeight: number,
    heightOfEarliestKnownValidBlock: number) {

    for (const block of blocks) {
      if (block.height >= startingBlockHeight && block.height <= heightOfEarliestKnownValidBlock) {
        notYetValidatedBlocks.set(
          block.hash,
          {
            height: block.height,
            hash: block.hash,
            totalFee: BitcoinProcessor.getBitcoinBlockTotalFee(block),
            transactionCount: block.transactions.length,
            previousHash: block.previousHash
          }
        );
        await this.processSidetreeTransactionsInBlock(block);
      }
    }
  }

  /**
   * Find all hashes in the notYetValidatedBlocks that are actually valid,
   * add them to the validated list and delete them from the map.
   */
  private findEarliestValidBlockAndAddToValidBlocks (
    validatedBlocks: BlockMetadataWithoutNormalizedFee[],
    notYetValidatedBlocks: Map<string, BlockMetadataWithoutNormalizedFee>,
    hashOfEarliestKnownValidBlock: string,
    startingBlockHeight: number) {

    let validBlockCount = 0; // Just for console print out purpose at the end.
    let validBlock = notYetValidatedBlocks.get(hashOfEarliestKnownValidBlock);
    while (validBlock !== undefined && validBlock.height >= startingBlockHeight) {
      validatedBlocks.push(validBlock);
      // delete because it is now validated
      notYetValidatedBlocks.delete(hashOfEarliestKnownValidBlock);
      // the previous block hash becomes valid
      hashOfEarliestKnownValidBlock = validBlock.previousHash;
      validBlock = notYetValidatedBlocks.get(hashOfEarliestKnownValidBlock);

      validBlockCount++;
    }

    Logger.info(LogColor.lightBlue(`Found ${LogColor.green(validBlockCount)} valid blocks.`));
  }

  private async removeTransactionsInInvalidBlocks (invalidBlocks: Map<string, BlockMetadataWithoutNormalizedFee>) {
    const hashes = invalidBlocks.keys();
    for (const hash of hashes) {
      await this.transactionStore.removeTransactionByTransactionTimeHash(hash);
    }
  }

  /**
   * Iterate through all the outputs in the first transaction (coinbase) and add up all the satoshis
   * then minus the block reward to get the total transaction fee.
   * @param block The block to get the fee for
   */
  private static getBitcoinBlockTotalFee (block: BitcoinBlockModel) {
    // get the total fee including block reward
    const coinbaseTransaction = block.transactions[0];
    let totalOutputSatoshi = 0;
    for (const output of coinbaseTransaction.outputs) {
      totalOutputSatoshi += output.satoshis;
    }

    // subtract block reward
    return totalOutputSatoshi - BitcoinProcessor.getBitcoinBlockReward(block.height);
  }

  /**
   * Given the block height, return the block reward
   */
  private static getBitcoinBlockReward (height: number) {
    const halvingTimes = Math.floor(height / 210000);
    if (halvingTimes >= 64) {
      return 0;
    }
    return Math.floor(5000000000 / (Math.pow(2, halvingTimes)));
  }

  /**
   * Iterates through the transactions within the given block and process the sidetree transactions
   * @param block the block to process
   */
  private async processSidetreeTransactionsInBlock (block: BitcoinBlockModel) {
    const transactions = block.transactions;
    // iterate through transactions
    for (let transactionIndex = 0; transactionIndex < transactions.length; transactionIndex++) {
      const transaction = transactions[transactionIndex];

      try {
        const sidetreeTxToAdd = await this.getSidetreeTransactionModelIfExist(transaction, transactionIndex, block.height);

        // If there are transactions found then add them to the transaction store
        if (sidetreeTxToAdd) {
          Logger.info(LogColor.lightBlue(`Sidetree transaction found; adding ${LogColor.green(JSON.stringify(sidetreeTxToAdd))}`));
          await this.transactionStore.addTransaction(sidetreeTxToAdd);
        }
      } catch (e) {
        const inputs = { blockHeight: block.height, blockHash: block.hash, transactionIndex: transactionIndex };
        Logger.info(
          `An error happened when trying to add sidetree transaction to the store. Moving on to the next transaction. Inputs: ${JSON.stringify(inputs)}\r\n` +
          `Full error: ${JSON.stringify(e, Object.getOwnPropertyNames(e))}`
        );

        throw e;
      }
    }
  }

  /**
   * Gets the blockchain time of the given time hash.
   * Gets the latest logical blockchain time if time hash is not given.
   * @param hash Blockchain time hash.
   * @returns the current or associated blockchain time of the given time hash.
   */
  public async time (hash?: string): Promise<IBlockchainTime> {
    Logger.info(`Getting time ${hash ? 'of time hash ' + hash : ''}`);
    if (!hash) {
      const block = await this.blockMetadataStore.getLast();
      return {
        time: block!.height,
        hash: block!.hash
      };
    }

    const blockInfo = await this.bitcoinClient.getBlockInfo(hash);

    return {
      hash: hash,
      time: blockInfo.height
    };
  }

  /**
   * Fetches Sidetree transactions in chronological order from since or genesis.
   * @param since A transaction number
   * @param hash The associated transaction time hash
   * @returns Transactions in complete blocks since given transaction number, with normalizedFee.
   */
  public async transactions (since?: number, hash?: string): Promise<{
    moreTransactions: boolean,
    transactions: TransactionModel[]
  }> {
    Logger.info(LogColor.lightBlue(`Transactions request: since transaction number ${LogColor.green(since)}, time hash '${LogColor.green(hash)}'...`));

    if ((since && !hash) ||
        (!since && hash)) {
      throw new RequestError(ResponseStatus.BadRequest);
    }

    if (since && hash) {
      if (!await this.verifyBlock(TransactionNumber.getBlockNumber(since), hash)) {
        Logger.info('Requested transactions hash mismatched blockchain');
        throw new RequestError(ResponseStatus.BadRequest, SharedErrorCode.InvalidTransactionNumberOrTimeHash);
      }
    }

    Logger.info(`Returning transactions since ${since ? 'block ' + TransactionNumber.getBlockNumber(since) : 'beginning'}...`);

    // We get the last processed block directly from DB because if this service has observer turned off,
    // it would not have the last processed block cached in memory.
    const lastProcessedBlock = await this.blockMetadataStore.getLast();
    if (lastProcessedBlock === undefined) {
      return {
        moreTransactions: false,
        transactions: []
      };
    }

    // NOTE: this conditional block is technically an optional optimization,
    // but it is a useful one especially when Bitcoin service's observing loop wait period is longer than that of the Core service's observing loop:
    // This prevents Core from repeatedly reverting its DB after detecting a fork then repopulating its DB with forked/invalid data again.
    if (!await this.verifyBlock(lastProcessedBlock.height, lastProcessedBlock.hash)) {
      Logger.info('Bitcoin service in a forked state, not returning transactions until the DB is reverted to correct chain.');
      return {
        moreTransactions: false,
        transactions: []
      };
    }

    const [transactions, lastBlockSeen] = await this.getTransactionsSince(since, lastProcessedBlock.height);

    // Add normalizedFee to transactions because internal to bitcoin, normalizedFee live in blockMetadata and have to be joined by block height
    // with transactions to get per transaction normalizedFee.
    if (transactions.length !== 0) {
      const inclusiveFirstBlockHeight = transactions[0].transactionTime;
      const exclusiveLastBlockHeight = transactions[transactions.length - 1].transactionTime + 1;
      const blockMetaData = await this.blockMetadataStore.get(inclusiveFirstBlockHeight, exclusiveLastBlockHeight);
      const blockMetaDataMap: Map<number, BlockMetadata> = new Map();
      for (const block of blockMetaData) {
        blockMetaDataMap.set(block.height, block);
      }

      for (const transaction of transactions) {
        const block = blockMetaDataMap.get(transaction.transactionTime);
        if (block !== undefined) {
          transaction.normalizedTransactionFee = this.versionManager.getFeeCalculator(block.height).calculateNormalizedTransactionFeeFromBlock(block);
        } else {
          throw new RequestError(ResponseStatus.ServerError, ErrorCode.BitcoinBlockMetadataNotFound);
        }
      }
    }

    // if last processed block has not been seen, then there are more transactions
    const moreTransactions = lastBlockSeen < lastProcessedBlock.height;

    return {
      transactions,
      moreTransactions
    };
  }

  /**
   * Given a list block metadata, returns the first in the list that has a valid hash,
   * returns `undefined` if a valid block is not found.
   */
  public async firstValidBlock (blocks: IBlockInfo[]): Promise<IBlockInfo | undefined> {
    for (let index = 0; index < blocks.length; index++) {
      const block = blocks[index];
      if (await this.verifyBlock(block.height, block.hash)) {
        return block;
      }
    }

    return undefined;
  }

  /**
   * Given an ordered list of Sidetree transactions, returns the first transaction in the list that is valid.
   * @param transactions List of transactions to check
   * @returns The first valid transaction, or undefined if none are valid
   */
  public async firstValidTransaction (transactions: TransactionModel[]): Promise<TransactionModel | undefined> {
    for (let index = 0; index < transactions.length; index++) {
      const transaction = transactions[index];
      const height = transaction.transactionTime;
      const hash = transaction.transactionTimeHash;
      if (await this.verifyBlock(height, hash)) {
        return transaction;
      }
    }

    return undefined;
  }

  /**
   * Writes a Sidetree transaction to the underlying Bitcoin's blockchain.
   * @param anchorString The string to be written as part of the transaction.
   * @param minimumFee The minimum fee to be paid for this transaction.
   */
  public async writeTransaction (anchorString: string, minimumFee: number) {
    const sidetreeTransactionString = `${this.config.sidetreeTransactionPrefix}${anchorString}`;
    const sidetreeTransaction = await this.bitcoinClient.createSidetreeTransaction(sidetreeTransactionString, minimumFee);
    const transactionFee = sidetreeTransaction.transactionFee;
    Logger.info(`Fee: ${transactionFee}. Anchoring string ${anchorString}`);

    const feeWithinSpendingLimits = await this.spendingMonitor.isCurrentFeeWithinSpendingLimit(transactionFee, this.lastProcessedBlock!.height);

    if (!feeWithinSpendingLimits) {
      throw new RequestError(ResponseStatus.BadRequest, SharedErrorCode.SpendingCapPerPeriodReached);
    }

    const totalSatoshis = await this.bitcoinClient.getBalanceInSatoshis();
    if (totalSatoshis < transactionFee) {
      const error = new Error(`Not enough satoshis to broadcast. Failed to broadcast anchor string ${anchorString}`);
      Logger.error(error);
      throw new RequestError(ResponseStatus.BadRequest, SharedErrorCode.NotEnoughBalanceForWrite);
    }

    const transactionHash = await this.bitcoinClient.broadcastSidetreeTransaction(sidetreeTransaction);
    Logger.info(LogColor.lightBlue(`Successfully submitted transaction [hash: ${LogColor.green(transactionHash)}]`));
    this.spendingMonitor.addTransactionDataBeingWritten(anchorString);
  }

  /**
   * Modifies the given array and update the normalized fees, then write to block metadata store.
   * @param blocks the ordered block metadata to set the normalized fee for.
   */
  private async writeBlocksToMetadataStoreWithFee (blocks: BlockMetadataWithoutNormalizedFee[]) {
    const blocksToWrite = [];
    for (const block of blocks) {
      const feeCalculator = await this.versionManager.getFeeCalculator(block.height);
      const blockMetadata = await feeCalculator.addNormalizedFeeToBlockMetadata({
        height: block.height,
        hash: block.hash,
        previousHash: block.previousHash,
        transactionCount: block.transactionCount,
        totalFee: block.totalFee
      });

      blocksToWrite.push(blockMetadata);
    }
    this.blockMetadataStore.add(blocksToWrite);
    this.lastProcessedBlock = blocksToWrite[blocksToWrite.length - 1];
  }

  /**
   * Calculate and return proof-of-fee value for a particular block.
   * @param block The block height to get normalized fee for
   */
  public async getNormalizedFee (block: number | string): Promise<TransactionFeeModel> {
    // this is to protect the number type because it can be passed as a string through request path
    const blockNumber = Number(block);
    if (blockNumber < this.genesisBlockNumber) {
      const error = `The input block number must be greater than or equal to: ${this.genesisBlockNumber}`;
      Logger.error(error);
      throw new RequestError(ResponseStatus.BadRequest, SharedErrorCode.BlockchainTimeOutOfRange);
    }
    const normalizedTransactionFee = await this.versionManager.getFeeCalculator(blockNumber).getNormalizedFee(blockNumber);

    return { normalizedTransactionFee: normalizedTransactionFee };
  }

  /**
   * Handles the get version operation.
   */
  public async getServiceVersion (): Promise<ServiceVersionModel> {
    return this.serviceInfoProvider.getServiceVersion();
  }

  /**
   * Gets the lock information for the specified identifier (if specified); if nothing is passed in then
   * it returns the current lock information (if one exist).
   *
   * @param lockIdentifier The identifier of the lock to look up.
   */
  public async getValueTimeLock (lockIdentifier: string): Promise<ValueTimeLockModel> {

    try {
      // NOTE: must return the await response as otherwise, the following exception handler is not invoked
      // (instead the caller's exception handler is invoked) and the correct status/error-code etc is not
      // bubbled up above.
      return await this.lockResolver.resolveSerializedLockIdentifierAndThrowOnError(lockIdentifier);
    } catch (e) {
      Logger.info(`Value time lock not found. Identifier: ${lockIdentifier}. Error: ${JSON.stringify(e, Object.getOwnPropertyNames(e))}`);
      throw new RequestError(ResponseStatus.NotFound, SharedErrorCode.ValueTimeLockNotFound);
    }
  }

  /**
   * Gets the lock information which is currently held by this node. It throws an RequestError if none exist.
   */
  public async getActiveValueTimeLockForThisNode (): Promise<ValueTimeLockModel> {
    let currentLock: ValueTimeLockModel | undefined;

    try {
      currentLock = await this.lockMonitor.getCurrentValueTimeLock();
    } catch (e) {

      if (e instanceof SidetreeError && e.code === ErrorCode.LockMonitorCurrentValueTimeLockInPendingState) {
        throw new RequestError(ResponseStatus.NotFound, ErrorCode.ValueTimeLockInPendingState);
      }

      Logger.error(`Current value time lock retrieval failed with error: ${JSON.stringify(e, Object.getOwnPropertyNames(e))}`);
      throw new RequestError(ResponseStatus.ServerError);
    }

    if (!currentLock) {
      throw new RequestError(ResponseStatus.NotFound, SharedErrorCode.ValueTimeLockNotFound);
    }

    return currentLock;
  }

  /**
   * Generates a private key for the Bitcoin testnet.
   */
  public static generatePrivateKeyForTestnet (): string {
    return BitcoinClient.generatePrivateKey('testnet');
  }

  /**
   * Will process transactions every interval seconds.
   * @param interval Number of seconds between each query
   */
  private async periodicPoll (interval: number = this.config.transactionPollPeriodInSeconds) {

    try {
      // Defensive programming to prevent multiple polling loops even if this method is externally called multiple times.
      if (this.pollTimeoutId) {
        clearTimeout(this.pollTimeoutId);
      }

      const startingBlock = await this.getStartingBlockForPeriodicPoll();

      if (startingBlock === undefined) {
        Logger.info('Bitcoin processor state is ahead of bitcoind: skipping periodic poll');
      } else {
        await this.processTransactions(startingBlock);
      }

      EventEmitter.emit(EventCode.BitcoinObservingLoopSuccess);
    } catch (error) {
      EventEmitter.emit(EventCode.BitcoinObservingLoopFailure);
      Logger.error(error);
    } finally {
      this.pollTimeoutId = setTimeout(this.periodicPoll.bind(this), 1000 * interval, interval);
    }
  }

  /**
   * Processes transactions from startBlock (or genesis) to the current blockchain height.
   * @param startBlock The block to begin from (inclusive)
   */
  private async processTransactions (startBlock: IBlockInfo) {
    Logger.info(`Starting processTransaction at: ${Date.now()}`);

    const startBlockHeight = startBlock.height;

    if (startBlockHeight < this.genesisBlockNumber) {
      throw new SidetreeError(
        ErrorCode.BitcoinProcessorCannotProcessBlocksBeforeGenesis,
        `Input block: ${startBlock}. Genesis block: ${this.genesisBlockNumber}`);
    }

    const endBlockHeight = await this.bitcoinClient.getCurrentBlockHeight();
    Logger.info(`Processing transactions from ${startBlockHeight} to ${endBlockHeight}`);

    let blockHeight = startBlockHeight;
    let previousBlockHash = startBlock.previousHash;
    while (blockHeight <= endBlockHeight) {
      const processedBlockMetadata = await this.processBlock(blockHeight, previousBlockHash);

      this.lastProcessedBlock = processedBlockMetadata;

      blockHeight++;
      previousBlockHash = processedBlockMetadata.hash;
    }

    Logger.info(`Finished processing blocks ${startBlockHeight} to ${endBlockHeight}`);
  }

  private async getStartingBlockForPeriodicPoll (): Promise<IBlockInfo | undefined> {
    // If last processed block is undefined, start processing from genesis block.
    if (this.lastProcessedBlock === undefined) {
      await this.trimDatabasesToBlock(); // Trim all data.
      return this.bitcoinClient.getBlockInfoFromHeight(this.genesisBlockNumber);
    }

    const lastProcessedBlockIsValid = await this.verifyBlock(this.lastProcessedBlock.height, this.lastProcessedBlock.hash);

    // If the last processed block is not valid then that means that we need to
    // revert the DB back to a known valid block.
    let lastValidBlock: IBlockInfo | undefined;
    if (lastProcessedBlockIsValid) {
      lastValidBlock = this.lastProcessedBlock;

      // We need to trim the DB data to the last processed block,
      // in case transactions in a block is saved successfully but error occurred when saving the block metadata.
      await this.trimDatabasesToBlock(lastValidBlock.height);
    } else {
      // The revert logic will return the last valid block.
      lastValidBlock = await this.revertDatabases();
    }

    // If there is a valid processed block, we will start processing the block following it, else start processing from the genesis block.
    const startingBlockHeight = lastValidBlock ? lastValidBlock.height + 1 : this.genesisBlockNumber;

    // The new starting block-height may not be actually written on the blockchain yet
    // so here we make sure that we don't return an 'invalid' starting block.
    const currentHeight = await this.bitcoinClient.getCurrentBlockHeight();
    if (startingBlockHeight > currentHeight) {
      return undefined;
    }

    // We have our new starting point
    return this.bitcoinClient.getBlockInfoFromHeight(startingBlockHeight);
  }

  /**
   * Begins to revert databases until consistent with blockchain.
   * @returns A known valid block before the fork. `undefined` if no known valid block can be found.
   */
  private async revertDatabases (): Promise<IBlockInfo | undefined> {
    Logger.info(`Reverting databases...`);
    const exponentiallySpacedBlocks = await this.blockMetadataStore.lookBackExponentially();
    const lastKnownValidBlock = await this.firstValidBlock(exponentiallySpacedBlocks);
    const lastKnownValidBlockHeight = lastKnownValidBlock ? lastKnownValidBlock.height : undefined;

    Logger.info(LogColor.lightBlue(`Reverting database to ${LogColor.green(lastKnownValidBlockHeight || 'genesis')} block...`));
    await this.trimDatabasesToBlock(lastKnownValidBlockHeight);

    EventEmitter.emit(EventCode.BitcoinDatabasesRevert, { blockHeight: lastKnownValidBlockHeight });
    return lastKnownValidBlock;
  }

  /**
   * Trims entries in the system DBs to the given a block height.
   * Trims all entries if no block height is given.
   * @param blockHeight The exclusive block height to perform DB trimming on.
   */
  private async trimDatabasesToBlock (blockHeight?: number) {
    Logger.info(`Trimming all block and transaction data after block height: ${blockHeight}`);

    // NOTE: Order is IMPORTANT!
    // *****
    // Remove block metadata BEFORE we remove any other data, because block metadata is used as the timestamp.
    await this.blockMetadataStore.removeLaterThan(blockHeight);

    const lastTransactionNumberOfGivenBlock = blockHeight ? TransactionNumber.lastTransactionOfBlock(blockHeight) : undefined;
    await this.transactionStore.removeTransactionsLaterThan(lastTransactionNumberOfGivenBlock);
  }

  /**
   * Given a Bitcoin block height and hash, verifies against the blockchain
   * @param height Block height to verify
   * @param hash Block hash to verify
   * @returns true if valid, false otherwise
   */
  private async verifyBlock (height: number, hash: string): Promise<boolean> {
    Logger.info(`Verifying block ${height} (${hash})`);
    const currentBlockHeight = await this.bitcoinClient.getCurrentBlockHeight();

    // this means the block height doesn't exist anymore
    if (currentBlockHeight < height) {
      return false;
    }

    const responseData = await this.bitcoinClient.getBlockHash(height);

    Logger.info(`Retrieved block ${height} (${responseData})`);
    return hash === responseData;
  }

  /**
   * Given a Bitcoin block height, processes that block for Sidetree transactions
   * @param blockHeight Height of block to process
   * @param previousBlockHash Block hash of the previous block
   * @returns the metadata of block processed
   */
  private async processBlock (blockHeight: number, previousBlockHash: string): Promise<BlockMetadata> {
    Logger.info(`Processing block ${blockHeight}`);
    const blockHash = await this.bitcoinClient.getBlockHash(blockHeight);
    const blockData = await this.bitcoinClient.getBlock(blockHash);

    // This check detects fork by ensuring the fetched block points to the expected previous block.
    if (blockData.previousHash !== previousBlockHash) {
      throw new SidetreeError(
        ErrorCode.BitcoinProcessInvalidPreviousBlockHash,
        `Previous hash from blockchain: ${blockData.previousHash}. Expected value: ${previousBlockHash}`);
    }

    await this.processSidetreeTransactionsInBlock(blockData);

    // Compute the total fee paid, total transaction count and normalized fee required for block metadata.
    const transactionCount = blockData.transactions.length;
    const totalFee = BitcoinProcessor.getBitcoinBlockTotalFee(blockData);
    const feeCalculator = this.versionManager.getFeeCalculator(blockHeight);
    const processedBlockMetadata = await feeCalculator.addNormalizedFeeToBlockMetadata({
      hash: blockHash,
      height: blockHeight,
      previousHash: blockData.previousHash,
      totalFee,
      transactionCount
    });

    await this.blockMetadataStore.add([processedBlockMetadata]);

    return processedBlockMetadata;
  }

  private async getSidetreeTransactionModelIfExist (
    transaction: BitcoinTransactionModel,
    transactionIndex: number,
    transactionBlock: number): Promise<TransactionModel | undefined> {

    const sidetreeData = await this.sidetreeTransactionParser.parse(transaction);

    if (sidetreeData) {
      const transactionFeePaid = await this.bitcoinClient.getTransactionFeeInSatoshis(transaction.id);

      return {
        transactionNumber: TransactionNumber.construct(transactionBlock, transactionIndex),
        transactionTime: transactionBlock,
        transactionTimeHash: transaction.blockHash,
        anchorString: sidetreeData.data,
        transactionFeePaid: transactionFeePaid,
        writer: sidetreeData.writer
      };
    }

    return undefined;
  }

  /**
   * Return transactions since transaction number and the last block seen
   * (Will get at least 1 full block worth of data unless there is no transaction to return)
   * @param since Transaction number to query since
   * @param maxBlockHeight The last block height to consider included in transactions
   * @returns a tuple of [transactions, lastBlockSeen]
   */
  private async getTransactionsSince (since: number | undefined, maxBlockHeight: number): Promise<[TransactionModel[], number]> {
    // test against undefined because 0 is falsy and this helps differentiate the behavior between 0 and undefined
    let inclusiveBeginTransactionTime = since === undefined ? this.genesisBlockNumber : TransactionNumber.getBlockNumber(since);

    const transactionsToReturn: TransactionModel[] = [];

    // while need more blocks and have not reached the processed block
    while (transactionsToReturn.length === 0 && inclusiveBeginTransactionTime <= maxBlockHeight) {
      const exclusiveEndTransactionTime = inclusiveBeginTransactionTime + BitcoinProcessor.pageSizeInBlocks;
      let transactions: TransactionModel[] = await this.transactionStore.getTransactionsStartingFrom(
        inclusiveBeginTransactionTime, exclusiveEndTransactionTime);

      transactions = transactions.filter((transaction) => {
        // filter anything greater than the last processed block because they are not complete
        return transaction.transactionTime <= maxBlockHeight &&
          // if there is a since, filter transactions that are less than or equal to since (the first block will have undesired transactions)
          (since === undefined || transaction.transactionNumber > since);
      });

      inclusiveBeginTransactionTime = exclusiveEndTransactionTime;
      transactionsToReturn.push(...transactions);
    }

    // the -1 makes the last seen transaction time inclusive because the variable is set to the exclusive one every loop
    return [transactionsToReturn, inclusiveBeginTransactionTime - 1];
  }
}

import BitcoinBlockModel from './models/BitcoinBlockModel';
import BitcoinBlockDataIterator from './BitcoinBlockDataIterator';
import BitcoinClient from './BitcoinClient';
import BitcoinServiceStateModel from './models/BitcoinServiceStateModel';
import BitcoinTransactionModel from './models/BitcoinTransactionModel';
import BlockMetadata from './models/BlockMetadata';
import ErrorCode from './ErrorCode';
import IBitcoinConfig from './IBitcoinConfig';
import LockMonitor from './lock/LockMonitor';
import LockResolver from './lock/LockResolver';
import LogColor from '../common/LogColor';
import MongoDbBlockMetadataStore from './MongoDbBlockMetadataStore';
import MongoDbLockTransactionStore from './lock/MongoDbLockTransactionStore';
import MongoDbServiceStateStore from '../common/MongoDbServiceStateStore';
import MongoDbTransactionStore from '../common/MongoDbTransactionStore';
import ProtocolParameters from './ProtocolParameters';
import RequestError from './RequestError';
import ResponseStatus from '../common/enums/ResponseStatus';
import ServiceInfoProvider from '../common/ServiceInfoProvider';
import ServiceVersionModel from '../common/models/ServiceVersionModel';
import SidetreeError from '../common/SidetreeError';
import SharedErrorCode from '../common/SharedErrorCode';
import SidetreeTransactionParser from './SidetreeTransactionParser';
import SpendingMonitor from './SpendingMonitor';
import TransactionFeeModel from '../common/models/TransactionFeeModel';
import TransactionModel from '../common/models/TransactionModel';
import TransactionNumber from './TransactionNumber';
import ValueTimeLockModel from '../common/models/ValueTimeLockModel';
import VersionManager from './VersionManager';
import VersionModel from '../common/models/VersionModel';

import timeSpan = require('time-span');

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

  /** Prefix used to identify Sidetree transactions in Bitcoin's blockchain. */
  public readonly sidetreePrefix: string;

  /** The first Sidetree block in Bitcoin's blockchain. */
  public readonly genesisBlockNumber: number;

  /** Store for the state of sidetree transactions. */
  private readonly transactionStore: MongoDbTransactionStore;

  /** Number of seconds between transaction queries */
  public pollPeriod: number;

  /** Days of notice before the wallet is depeleted of all funds */
  public lowBalanceNoticeDays: number;

  private versionManager: VersionManager;

  /** Last seen block */
  private lastProcessedBlock: IBlockInfo | undefined;

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

  private bitcoinDataDirectory: string | undefined;

  /** at least 10 blocks per page unless reaching the last block */
  private static readonly pageSizeInBlocks = 10;

  public constructor (config: IBitcoinConfig, versionModels: VersionModel[]) {
    this.versionManager = new VersionManager(versionModels);

    this.sidetreePrefix = config.sidetreeTransactionPrefix;
    this.genesisBlockNumber = config.genesisBlockNumber;
    this.bitcoinDataDirectory = config.bitcoinDataDirectory;

    this.serviceStateStore = new MongoDbServiceStateStore(config.mongoDbConnectionString, config.databaseName);
    this.blockMetadataStore = new MongoDbBlockMetadataStore(config.mongoDbConnectionString, config.databaseName);
    this.transactionStore = new MongoDbTransactionStore(config.mongoDbConnectionString, config.databaseName);

    this.spendingMonitor = new SpendingMonitor(config.bitcoinFeeSpendingCutoffPeriodInBlocks,
      BitcoinClient.convertBtcToSatoshis(config.bitcoinFeeSpendingCutoff),
      this.transactionStore);

    this.pollPeriod = config.transactionPollPeriodInSeconds || 60;
    this.lowBalanceNoticeDays = config.lowBalanceNoticeInDays || 28;
    this.serviceInfoProvider = new ServiceInfoProvider('bitcoin');

    this.bitcoinClient =
      new BitcoinClient(
        config.bitcoinPeerUri,
        config.bitcoinRpcUsername,
        config.bitcoinRpcPassword,
        config.bitcoinWalletOrImportString,
        config.requestTimeoutInMilliseconds || 300,
        config.requestMaxRetries || 3,
        config.sidetreeTransactionFeeMarkupPercentage || 0);

    this.sidetreeTransactionParser = new SidetreeTransactionParser(this.bitcoinClient, this.sidetreePrefix);

    this.lockResolver =
      new LockResolver(
        this.versionManager,
        this.bitcoinClient,
        ProtocolParameters.minimumValueTimeLockDurationInBlocks,
        ProtocolParameters.maximumValueTimeLockDurationInBlocks);

    this.mongoDbLockTransactionStore = new MongoDbLockTransactionStore(config.mongoDbConnectionString, config.databaseName);

    const valueTimeLockTransactionFeesInBtc = config.valueTimeLockTransactionFeesAmountInBitcoins === 0 ? 0
                                              : config.valueTimeLockTransactionFeesAmountInBitcoins || 0.25;

    this.lockMonitor =
      new LockMonitor(
        this.bitcoinClient,
        this.mongoDbLockTransactionStore,
        this.lockResolver,
        config.valueTimeLockPollPeriodInSeconds || 10 * 60,
        BitcoinClient.convertBtcToSatoshis(config.valueTimeLockAmountInBitcoins), // Desired lock amount in satoshis
        BitcoinClient.convertBtcToSatoshis(valueTimeLockTransactionFeesInBtc),    // Txn Fees amoount in satoshis
        ProtocolParameters.maximumValueTimeLockDurationInBlocks);                 // Desired lock duration in blocks
  }

  /**
   * Initializes the Bitcoin processor
   */
  public async initialize () {
    await this.versionManager.initialize();
    await this.serviceStateStore.initialize();
    await this.blockMetadataStore.initialize();
    await this.transactionStore.initialize();
    await this.bitcoinClient.initialize();
    await this.mongoDbLockTransactionStore.initialize();

    await this.upgradeDatabaseIfNeeded();

    // Current implementation records processing progress at block increments using `this.lastProcessedBlock`,
    // so we need to trim the databases back to the last fully processed block.
    this.lastProcessedBlock = await this.blockMetadataStore.getLast();

    const startingBlock = await this.getStartingBlockForPeriodicPoll();

    // Throw if bitcoin client is not synced up to the bitcoin service's known height.
    // NOTE: Implementation for issue #692 can simplify this method and remove this check.
    if (startingBlock === undefined) {
      throw new SidetreeError(ErrorCode.BitcoinProcessorBitcoinClientCurrentHeightNotUpToDate);
    }

    console.debug('Synchronizing blocks for sidetree transactions...');
    console.info(`Starting block: ${startingBlock.height} (${startingBlock.hash})`);
    if (this.bitcoinDataDirectory) {
      // This reads into the raw block files and parse to speed up the initial startup instead of rpc
      await this.fastProcessTransactions(startingBlock);
    } else {
      await this.processTransactions(startingBlock);
    }

    // NOTE: important to this initialization after we have processed all the blocks
    // this is because that the lock monitor needs the normalized fee calculator to
    // have all the data.
    await this.lockMonitor.initialize();
    void this.periodicPoll();
  }

  private async upgradeDatabaseIfNeeded () {
    const currentServiceVersion = await this.getServiceVersion();
    const savedServiceState = await this.serviceStateStore.get();
    const savedServiceVersion = savedServiceState ? savedServiceState.serviceVersion : 'unknown';

    if (savedServiceVersion === currentServiceVersion.version) {
      return;
    }

    // Add DB upgrade code below.

    // Only upgrade the DB if we don't know the save service version.
    if (savedServiceVersion === 'unknown') {
      const timer = timeSpan();

      // Current upgrade action is simply clearing/deleting existing DB such that initial sync can occur from genesis block.
      await this.blockMetadataStore.clearCollection();
      await this.transactionStore.clearCollection();

      await this.serviceStateStore.put({ serviceVersion: currentServiceVersion.version });

      console.info(`DB upgraded in: ${timer.rounded()} ms.`);
    }
  }

  /**
   * A faster version of process transactions that requires access to bitcoin data directory
   * @param startingBlock the starting block to begin processing
   */
  private async fastProcessTransactions (startingBlock: IBlockInfo) {
    const bitcoinBlockDataIterator = new BitcoinBlockDataIterator(this.bitcoinDataDirectory!);
    const lastBlockHeight = await this.bitcoinClient.getCurrentBlockHeight();
    const lastBlockInfo = await this.bitcoinClient.getBlockInfoFromHeight(lastBlockHeight);

    // a map of all blocks mapped with their hash being the key
    const notYetValidatedBlocks: Map<string, BlockMetadata> = new Map();
    // An array of blocks representing the validated chain reverse sorted by height
    const validatedBlocks: BlockMetadata[] = [];

    console.log(`Begin fast processing block ${startingBlock.height} to ${lastBlockHeight}`);
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
    await this.blockMetadataStore.add(validatedBlocks);
    console.info(`Inserted metadata of ${validatedBlocks.length} blocks to DB. Duration: ${timer.rounded()} ms.`);

    this.lastProcessedBlock = lastBlockInfo;
    console.log('finished fast processing');
  }

  private async processBlocks (
    blocks: BitcoinBlockModel[],
    notYetValidatedBlocks: Map<string, BlockMetadata>,
    startingBlockHeight: number,
    heightOfEarliestKnownValidBlock: number) {

    for (let block of blocks) {
      if (block.height >= startingBlockHeight && block.height <= heightOfEarliestKnownValidBlock) {
        notYetValidatedBlocks.set(
          block.hash,
          {
            height: block.height,
            hash: block.hash,
            totalFee: BitcoinProcessor.getBitcoinBlockTotalFee(block),
            transactionCount: block.transactions.length,
            previousHash: block.previousHash }
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
    validatedBlocks: BlockMetadata[],
    notYetValidatedBlocks: Map<string, BlockMetadata>,
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

    console.log(LogColor.lightBlue(`Found ${LogColor.green(validBlockCount)} valid blocks.`));
  }

  private async removeTransactionsInInvalidBlocks (invalidBlocks: Map<string, BlockMetadata>) {
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
    for (let output of coinbaseTransaction.outputs) {
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
          console.debug(LogColor.lightBlue(`Sidetree transaction found; adding ${LogColor.green(JSON.stringify(sidetreeTxToAdd))}`));
          await this.transactionStore.addTransaction(sidetreeTxToAdd);
        }
      } catch (e) {
        const inputs = { blockHeight: block.height, blockHash: block.hash, transactionIndex: transactionIndex };
        console.debug('An error happened when trying to add sidetree transaction to the store. Moving on to the next transaction. Inputs: %s\r\nFull error: %s',
                      JSON.stringify(inputs),
                      JSON.stringify(e, Object.getOwnPropertyNames(e)));

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
    console.info(`Getting time ${hash ? 'of time hash ' + hash : ''}`);
    if (!hash) {
      const blockHeight = await this.bitcoinClient.getCurrentBlockHeight();
      hash = await this.bitcoinClient.getBlockHash(blockHeight);
      return {
        time: blockHeight,
        hash
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
   * @returns Transactions in complete blocks since given transaction number.
   */
  public async transactions (since?: number, hash?: string): Promise<{
    moreTransactions: boolean,
    transactions: TransactionModel[]
  }> {
    if ((since && !hash) ||
        (!since && hash)) {
      throw new RequestError(ResponseStatus.BadRequest);
    } else if (since && hash) {
      if (!await this.verifyBlock(TransactionNumber.getBlockNumber(since), hash)) {
        console.info('Requested transactions hash mismatched blockchain');
        throw new RequestError(ResponseStatus.BadRequest, SharedErrorCode.InvalidTransactionNumberOrTimeHash);
      }
    }

    console.info(`Returning transactions since ${since ? 'block ' + TransactionNumber.getBlockNumber(since) : 'beginning'}...`);
    // deep copy last processed block
    const currentLastProcessedBlock = Object.assign({}, this.lastProcessedBlock!);
    let [transactions, numOfBlocksAcquired] = await this.getTransactionsSince(since, currentLastProcessedBlock.height);

    // make sure the last processed block hasn't changed since before getting transactions
    // if changed, then a block reorg happened.
    if (!await this.verifyBlock(currentLastProcessedBlock.height, currentLastProcessedBlock.hash)) {
      console.info('Requested transactions hash mismatched blockchain');
      throw new RequestError(ResponseStatus.BadRequest, SharedErrorCode.InvalidTransactionNumberOrTimeHash);
    }

    // if not enough blocks to fill the page then there are no more transactions
    const moreTransactions = numOfBlocksAcquired >= BitcoinProcessor.pageSizeInBlocks;

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
    return;
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
    return;
  }

  /**
   * Writes a Sidetree transaction to the underlying Bitcoin's blockchain.
   * @param anchorString The string to be written as part of the transaction.
   * @param minimumFee The minimum fee to be paid for this transaction.
   */
  public async writeTransaction (anchorString: string, minimumFee: number) {
    const sidetreeTransactionString = `${this.sidetreePrefix}${anchorString}`;
    const sidetreeTransaction = await this.bitcoinClient.createSidetreeTransaction(sidetreeTransactionString, minimumFee);
    const transactionFee = sidetreeTransaction.transactionFee;
    console.info(`Fee: ${transactionFee}. Anchoring string ${anchorString}`);

    const feeWithinSpendingLimits = await this.spendingMonitor.isCurrentFeeWithinSpendingLimit(transactionFee, this.lastProcessedBlock!.height);

    if (!feeWithinSpendingLimits) {
      throw new RequestError(ResponseStatus.BadRequest, SharedErrorCode.SpendingCapPerPeriodReached);

    }

    // Write a warning if the balance is running low
    const totalSatoshis = await this.bitcoinClient.getBalanceInSatoshis();

    const estimatedBitcoinWritesPerDay = 6 * 24;
    const lowBalanceAmount = this.lowBalanceNoticeDays * estimatedBitcoinWritesPerDay * transactionFee;
    if (totalSatoshis < lowBalanceAmount) {
      const daysLeft = Math.floor(totalSatoshis / (estimatedBitcoinWritesPerDay * transactionFee));
      console.error(`Low balance (${daysLeft} days remaining), please fund your wallet. Amount: >=${lowBalanceAmount - totalSatoshis} satoshis.`);
    }

    // cannot make the transaction
    if (totalSatoshis < transactionFee) {
      const error = new Error(`Not enough satoshis to broadcast. Failed to broadcast anchor string ${anchorString}`);
      console.error(error);
      throw new RequestError(ResponseStatus.BadRequest, SharedErrorCode.NotEnoughBalanceForWrite);
    }

    const transactionHash = await this.bitcoinClient.broadcastSidetreeTransaction(sidetreeTransaction);
    console.info(LogColor.lightBlue(`Successfully submitted transaction [hash: ${LogColor.green(transactionHash)}]`));
    this.spendingMonitor.addTransactionDataBeingWritten(anchorString);
  }

  /**
   * Return proof-of-fee value for a particular block.
   */
  public async getNormalizedFee (block: number): Promise<TransactionFeeModel> {

    if (block < this.genesisBlockNumber) {
      const error = `The input block number must be greater than or equal to: ${this.genesisBlockNumber}`;
      console.error(error);
      throw new RequestError(ResponseStatus.BadRequest, SharedErrorCode.BlockchainTimeOutOfRange);
    }

    const normalizedTransactionFee = this.versionManager.getFeeCalculator(block).getNormalizedFee(block);

    return { normalizedTransactionFee };
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
      console.info(`Value time lock not found. Identifier: ${lockIdentifier}. Error: ${JSON.stringify(e, Object.getOwnPropertyNames(e))}`);
      throw new RequestError(ResponseStatus.NotFound, SharedErrorCode.ValueTimeLockNotFound);
    }
  }

  /**
   * Gets the lock information which is currently held by this node. It throws an RequestError if none exist.
   */
  public getActiveValueTimeLockForThisNode (): ValueTimeLockModel {
    let currentLock: ValueTimeLockModel | undefined;

    try {
      currentLock = this.lockMonitor.getCurrentValueTimeLock();
    } catch (e) {

      if (e instanceof SidetreeError && e.code === ErrorCode.LockMonitorCurrentValueTimeLockInPendingState) {
        throw new RequestError(ResponseStatus.NotFound, ErrorCode.ValueTimeLockInPendingState);
      }

      console.error(`Current value time lock retrieval failed with error: ${JSON.stringify(e, Object.getOwnPropertyNames(e))}`);
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
  private async periodicPoll (interval: number = this.pollPeriod) {

    try {
      // Defensive programming to prevent multiple polling loops even if this method is externally called multiple times.
      if (this.pollTimeoutId) {
        clearTimeout(this.pollTimeoutId);
      }

      const startingBlock = await this.getStartingBlockForPeriodicPoll();

      if (startingBlock) {
        await this.processTransactions(startingBlock);
      }
    } catch (error) {
      console.error(error);
    } finally {
      this.pollTimeoutId = setTimeout(this.periodicPoll.bind(this), 1000 * interval, interval);
    }
  }

  /**
   * Processes transactions from startBlock (or genesis) to the current blockchain height.
   * @param startBlock The block to begin from (inclusive)
   */
  private async processTransactions (startBlock: IBlockInfo) {
    console.info(`Starting processTransaction at: ${Date.now()}`);

    const startBlockHeight = startBlock.height;

    if (startBlockHeight < this.genesisBlockNumber) {
      throw new SidetreeError(
        ErrorCode.BitcoinProcessorCannotProcessBlocksBeforeGenesis,
        `Input block: ${startBlock}. Genesis block: ${this.genesisBlockNumber}`);
    }

    const endBlockHeight = await this.bitcoinClient.getCurrentBlockHeight();
    console.info(`Processing transactions from ${startBlockHeight} to ${endBlockHeight}`);

    let blockHeight = startBlockHeight;
    let previousBlockHash = startBlock.previousHash;
    while (blockHeight <= endBlockHeight) {
      const processedBlockMetadata = await this.processBlock(blockHeight, previousBlockHash);

      await this.blockMetadataStore.add([processedBlockMetadata]);

      this.lastProcessedBlock = {
        hash: processedBlockMetadata.hash,
        height: processedBlockMetadata.height,
        previousHash: processedBlockMetadata.previousHash
      };

      blockHeight++;
      previousBlockHash = processedBlockMetadata.hash;
    }

    console.info(`Finished processing blocks ${startBlockHeight} to ${endBlockHeight}`);
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
    const exponentiallySpacedBlocks = await this.blockMetadataStore.lookBackExponentially();
    const lastKnownValidBlock = await this.firstValidBlock(exponentiallySpacedBlocks);

    await this.trimDatabasesToBlock(lastKnownValidBlock?.height);

    return lastKnownValidBlock;
  }

  /**
   * Trims entries in the system DBs to the given a block height.
   * Trims all entries if no block height is given.
   * @param blockHeight The exclusive block height to perform DB trimming on.
   */
  private async trimDatabasesToBlock (blockHeight?: number) {
    console.info(`Trimming all block and transaction data after block height: ${blockHeight}`);

    // NOTE: Order is IMPORTANT!
    // *****
    // Remove block metadata BEFORE we remove any other data, because block metata is used as the timestamp.
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
    console.info(`Verifying block ${height} (${hash})`);
    const currentBlockHeight = await this.bitcoinClient.getCurrentBlockHeight();

    // this means the block height doesn't exist anymore
    if (currentBlockHeight < height) {
      return false;
    }

    const responseData = await this.bitcoinClient.getBlockHash(height);

    console.debug(`Retrieved block ${height} (${responseData})`);
    return hash === responseData;
  }

  /**
   * Given a Bitcoin block height, processes that block for Sidetree transactions
   * @param blockHeight Height of block to process
   * @param previousBlockHash Block hash of the previous block
   * @returns the metadata of block processed
   */
  private async processBlock (blockHeight: number, previousBlockHash: string): Promise<BlockMetadata> {
    console.info(`Processing block ${blockHeight}`);
    const blockHash = await this.bitcoinClient.getBlockHash(blockHeight);
    const blockData = await this.bitcoinClient.getBlock(blockHash);

    // This check detects fork by ensuring the fetched block points to the expected previous block.
    if (blockData.previousHash !== previousBlockHash) {
      throw new SidetreeError(
        ErrorCode.BitcoinProcessInvalidPreviousBlockHash,
        `Previous hash from blockchain: ${blockData.previousHash}. Expected value: ${previousBlockHash}`);
    }

    await this.processSidetreeTransactionsInBlock(blockData);

    // Compute the total fee paid and total transaction count.
    const transactionCount = blockData.transactions.length;
    const totalFee = BitcoinProcessor.getBitcoinBlockTotalFee(blockData);

    const processedBlockMetadata: BlockMetadata = {
      hash: blockHash,
      height: blockHeight,
      previousHash: blockData.previousHash,
      totalFee,
      transactionCount
    };

    return processedBlockMetadata;
  }

  private async getSidetreeTransactionModelIfExist (
    transaction: BitcoinTransactionModel,
    transactionIndex: number,
    transactionBlock: number): Promise<TransactionModel | undefined> {

    const sidetreeData = await this.sidetreeTransactionParser.parse(transaction);

    if (sidetreeData) {
      const transactionFeePaid = await this.bitcoinClient.getTransactionFeeInSatoshis(transaction.id);
      const normalizedFeeModel = await this.getNormalizedFee(transactionBlock);

      return {
        transactionNumber: TransactionNumber.construct(transactionBlock, transactionIndex),
        transactionTime: transactionBlock,
        transactionTimeHash: transaction.blockHash,
        anchorString: sidetreeData.data,
        transactionFeePaid: transactionFeePaid,
        normalizedTransactionFee: normalizedFeeModel.normalizedTransactionFee,
        writer: sidetreeData.writer
      };
    }

    return undefined;
  }

  /**
   * Return transactions since transaction number and number of blocks acquired (Will get at least pageSizeInBlocks)
   * @param since Transaction number to query since
   * @param maxBlockHeight The last block height to consider included in transactions
   * @returns a tuple of [transactions, numberOfBlocksContainedInTransactions]
   */
  private async getTransactionsSince (since: number | undefined, maxBlockHeight: number): Promise<[TransactionModel[], number]> {
    let inclusiveBeginTransactionTime = since === undefined ? this.genesisBlockNumber : TransactionNumber.getBlockNumber(since);
    let numOfBlocksAcquired = 0;

    const transactionsToReturn: TransactionModel[] = [];

    // while need more blocks and have not reached the processed block
    while (numOfBlocksAcquired < BitcoinProcessor.pageSizeInBlocks && inclusiveBeginTransactionTime <= maxBlockHeight) {
      const exclusiveEndTransactionTime = inclusiveBeginTransactionTime + BitcoinProcessor.pageSizeInBlocks;
      let transactions: TransactionModel[] = await this.transactionStore.getTransactionsStartingFrom(
        inclusiveBeginTransactionTime, exclusiveEndTransactionTime);

      transactions = transactions.filter((transaction) => {
        // filter anything greater than the last processed block because they are not complete
        return transaction.transactionTime <= maxBlockHeight &&
          // if there is a since, filter transactions that are less than or equal to since (the first block will have undesired transactions)
          (since === undefined || transaction.transactionNumber > since);
      });

      numOfBlocksAcquired += BitcoinProcessor.getUniqueNumOfBlocksInTransactions(transactions);
      inclusiveBeginTransactionTime = exclusiveEndTransactionTime;
      transactionsToReturn.push(...transactions);
    }

    return [transactionsToReturn, numOfBlocksAcquired];
  }

  private static getUniqueNumOfBlocksInTransactions (transactions: TransactionModel[]): number {
    const uniqueBlockNumbers = new Set<number>();
    for (const transaction of transactions) {
      uniqueBlockNumbers.add(transaction.transactionTime);
    }

    return uniqueBlockNumbers.size;
  }
}

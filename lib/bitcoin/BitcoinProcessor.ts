import BitcoinClient from './BitcoinClient';
import BitcoinTransactionModel from './models/BitcoinTransactionModel';
import ErrorCode from './ErrorCode';
import IBitcoinConfig from './IBitcoinConfig';
import LockMonitor from './lock/LockMonitor';
import LockResolver from './lock/LockResolver';
import LogColor from '../common/LogColor';
import MongoDbLockTransactionStore from './lock/MongoDbLockTransactionStore';
import MongoDbSlidingWindowQuantileStore from './fee/MongoDbSlidingWindowQuantileStore';
import MongoDbTransactionStore from '../common/MongoDbTransactionStore';
import NormalizedFeeCalculator from './fee/NormalizedFeeCalculator';
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

  /** Last seen block */
  private lastProcessedBlock: IBlockInfo | undefined;

  /** Poll timeout identifier */
  private pollTimeoutId: number | undefined;

  private serviceInfoProvider: ServiceInfoProvider;

  private bitcoinClient: BitcoinClient;

  private spendingMonitor: SpendingMonitor;

  private mongoDbLockTransactionStore: MongoDbLockTransactionStore;

  private lockResolver: LockResolver;

  private lockMonitor: LockMonitor;

  private sidetreeTransactionParser: SidetreeTransactionParser;

  private mongoQuantileStore: MongoDbSlidingWindowQuantileStore;

  private normalizedFeeCalculator: NormalizedFeeCalculator;

  /** at least 10 blocks per page unless reaching the last block */
  private static readonly pageSizeInBlocks = 10;

  public constructor (config: IBitcoinConfig) {
    this.sidetreePrefix = config.sidetreeTransactionPrefix;
    this.genesisBlockNumber = config.genesisBlockNumber;
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

    this.mongoQuantileStore = new MongoDbSlidingWindowQuantileStore(config.mongoDbConnectionString, config.databaseName);

    this.normalizedFeeCalculator = new NormalizedFeeCalculator(
      this.genesisBlockNumber,
      this.mongoQuantileStore,
      this.bitcoinClient,
      this.sidetreeTransactionParser
    );

    this.lockResolver =
      new LockResolver(
        this.bitcoinClient,
        ProtocolParameters.minimumValueTimeLockDurationInBlocks,
        ProtocolParameters.maximumValueTimeLockDurationInBlocks,
        this.normalizedFeeCalculator);

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
    await this.transactionStore.initialize();
    await this.bitcoinClient.initialize();
    await this.mongoQuantileStore.initialize();
    await this.normalizedFeeCalculator.initialize();
    await this.mongoDbLockTransactionStore.initialize();

    // We always need to start the processing from the first block of a fee sampling group
    // so that in-memory state for fee sampling will be repoppulated yielding correct fee calculation,
    // so we trim the databases to make sure this condition is met.
    // NOTE: We also initialize the `lastProcessedBlock`, this is an opional step currently,
    // but will be required if Issue #692 is implemented.
    this.lastProcessedBlock = await this.trimDatabasesToLastFeeSamplingGroupBoundary();

    console.debug('Synchronizing blocks for sidetree transactions...');
    const startingBlock = await this.getStartingBlockForPeriodicPoll();

    // Throw if bitcoin client is not synced up to the bitcoin service's known height.
    // NOTE: Implementation for issue #692 can simplify this method and remove this check.
    if (startingBlock === undefined) {
      throw new SidetreeError(ErrorCode.BitcoinProcessorBitcoinClientCurrentHeightNotUpToDate);
    }

    console.info(`Starting block: ${startingBlock.height} (${startingBlock.hash})`);
    await this.processTransactions(startingBlock);

    // NOTE: important to this initialization after we have processed all the blocks
    // this is because that the lock monitor needs the normalized fee calculator to
    // have all the data.
    await this.lockMonitor.initialize();
    void this.periodicPoll();
  }

  /**
   * NOTE: Should be used ONLY during service initialization.
   * @returns The last processed block after trimming. `undefined` if all data are deleted after trimming.
   */
  private async trimDatabasesToLastFeeSamplingGroupBoundary (): Promise<IBlockInfo | undefined> {
    // Look in the transaction store to figure out the last block that we need to start from.
    const lastSavedTransaction = await this.transactionStore.getLastTransaction();

    // If there is no transaction saved in the DBs, we still need to perform trimming
    // because there could be stale fee calculater data lingering, so we trim using the genesis block.
    let lastValidBlock;
    if (lastSavedTransaction === undefined) {
      lastValidBlock = await this.trimDatabasesToFeeSamplingGroupBoundary(this.genesisBlockNumber);
    } else {
      // Else we trim DBs using the block number of the last saved transaction.
      lastValidBlock = await this.trimDatabasesToFeeSamplingGroupBoundary(lastSavedTransaction.transactionTime);
    }

    return lastValidBlock;
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

    const quantileValue = this.normalizedFeeCalculator.getNormalizedFee(block);

    if (quantileValue) {
      return { normalizedTransactionFee: quantileValue };
    }

    console.error(`Unable to get the normalized fee from the quantile calculator for block: ${block}. Seems like that the service isn't ready yet.`);
    throw new RequestError(ResponseStatus.BadRequest, SharedErrorCode.BlockchainTimeOutOfRange);
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
   * @returns The block height and hash it processed to
   */
  private async processTransactions (startBlock: IBlockInfo): Promise<IBlockInfo> {
    console.info(`Starting processTransaction at: ${Date.now()}`);

    const startBlockHeight = startBlock.height;

    if (startBlockHeight < this.genesisBlockNumber) {
      throw new SidetreeError(
        ErrorCode.BitcoinProcessorCannotProcessBlocksBeforeGenesis,
        `Input block: ${startBlock}. Genesis block: ${this.genesisBlockNumber}`);
    }

    const endBlockHeight = await this.bitcoinClient.getCurrentBlockHeight();
    console.info(`Processing transactions from ${startBlockHeight} to ${endBlockHeight}`);

    let previousBlockHash = startBlock.previousHash;

    for (let blockHeight = startBlockHeight; blockHeight <= endBlockHeight; blockHeight++) {
      const processedBlockHash = await this.processBlock(blockHeight, previousBlockHash);

      this.lastProcessedBlock = {
        height: blockHeight,
        hash: processedBlockHash,
        previousHash: previousBlockHash
      };

      previousBlockHash = processedBlockHash;
    }

    console.info(`Finished processing blocks ${startBlockHeight} to ${endBlockHeight}`);
    return this.lastProcessedBlock!;
  }

  private async getStartingBlockForPeriodicPoll (): Promise<IBlockInfo | undefined> {
    // If last processed block is undefined, start processing from genesis block.
    if (this.lastProcessedBlock === undefined) {
      await this.trimDatabasesToLastFeeSamplingGroupBoundary();
      return this.bitcoinClient.getBlockInfoFromHeight(this.genesisBlockNumber);
    }

    const lastProcessedBlockIsValid = await this.verifyBlock(this.lastProcessedBlock.height, this.lastProcessedBlock.hash);

    // If the last processed block is not valid then that means that we need to
    // revert the DB back to a known valid block.
    let lastValidBlock: IBlockInfo | undefined;
    if (lastProcessedBlockIsValid) {
      lastValidBlock = this.lastProcessedBlock;
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
    console.info('Reverting transactions');

    const exponentiallySpacedTransactions = await this.transactionStore.getExponentiallySpacedTransactions();
    const lastKnownValidTransaction = await this.firstValidTransaction(exponentiallySpacedTransactions);

    // No known valid transaction found.
    if (lastKnownValidTransaction === undefined) {
      await this.trimDatabasesToFeeSamplingGroupBoundary(this.genesisBlockNumber);
      console.warn('Reverted all known transactions.');

      return undefined;
    }

    // Else we have a valid transaction, so revert the DBs based using that last knwon valid transaction.
    const lastValidBlockAfterDatabaseTrimming = this.trimDatabasesToFeeSamplingGroupBoundary(lastKnownValidTransaction.transactionTime);
    return lastValidBlockAfterDatabaseTrimming;
  }

  /**
   * Trims entries from the system DBs to the closest previous full fee sampling group boundary of the given a block number.
   * @param blockNumber The block number to perform DB trimming on.
   * @returns The last processed block after trimming. `undefined` if all data are deleted after trimming.
   */
  private async trimDatabasesToFeeSamplingGroupBoundary (blockNumber: number): Promise<IBlockInfo | undefined> {

    console.info(`Reverting quantile and transaction DBs to closest fee sampling group boundary given block: ${blockNumber}`);

    // Basically, we need to remove all the transactions/normazlied-fee-data from the system later than the
    // specified `blockNumber` input.

    // Get the first block and transaction from the group which are supposed to be deleted
    const firstTxnOfGroup = this.normalizedFeeCalculator.getFirstTransactionOfGroup(blockNumber);
    const firstBlockInGroup = TransactionNumber.getBlockNumber(firstTxnOfGroup);

    // NOTE:
    // *****
    // Make sure that we remove the transaction data BEFORE we remove the normalized data. This is
    // because that if the service stops at any moment after this, the initialize code looks at
    // the transaction store and can revert the quantile db accordingly.
    // Remove all the txns which are in that first block (and greater)
    await this.transactionStore.removeTransactionsLaterThan(firstTxnOfGroup - 1);

    // Remove all the data from the normalized fee data DBs
    await this.normalizedFeeCalculator.trimDatabasesToGroupBoundary(blockNumber);

    // If we have deleted all data, there is no last known valid block in the system to return.
    if (firstBlockInGroup <= this.genesisBlockNumber) {
      return undefined;
    }

    // Else the last valid block becomes the block just before `firstBlockInGroup`.
    const lastValidBlockAfterTrimming = firstBlockInGroup - 1;
    return this.bitcoinClient.getBlockInfoFromHeight(lastValidBlockAfterTrimming);
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
   * @param block Block height to process
   * @param previousBlockHash Block hash of the previous block
   * @returns the block hash processed
   */
  private async processBlock (block: number, previousBlockHash: string): Promise<string> {
    console.info(`Processing block ${block}`);
    const blockHash = await this.bitcoinClient.getBlockHash(block);
    const blockData = await this.bitcoinClient.getBlock(blockHash);

    // This check detects fork by ensuring the fetched block points to the expected previous block.
    if (blockData.previousHash !== previousBlockHash) {
      throw new SidetreeError(
        ErrorCode.BitcoinProcessInvalidPreviousBlockHash,
        `Previous hash from blockchain: ${blockData.previousHash}. Expected value: ${previousBlockHash}`);
    }

    await this.normalizedFeeCalculator.processBlock(blockData);

    const transactions = blockData.transactions;

    // iterate through transactions
    for (let transactionIndex = 0; transactionIndex < transactions.length; transactionIndex++) {
      const transaction = transactions[transactionIndex];

      try {
        const sidetreeTxToAdd = await this.getSidetreeTransactionModelIfExist(transaction, transactionIndex, block);

        // If there are transactions found then add them to the transaction store
        if (sidetreeTxToAdd) {
          console.debug(`Sidetree transaction found; adding ${JSON.stringify(sidetreeTxToAdd)}`);
          await this.transactionStore.addTransaction(sidetreeTxToAdd);
        }
      } catch (e) {
        const inputs = { block: block, blockHash: blockHash, transactionIndex: transactionIndex };
        console.debug('An error happened when trying to add sidetree transaction to the store. Moving on to the next transaction. Inputs: %s\r\nFull error: %s',
                       JSON.stringify(inputs),
                       JSON.stringify(e, Object.getOwnPropertyNames(e)));

        throw e;
      }
    }

    return blockHash;
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

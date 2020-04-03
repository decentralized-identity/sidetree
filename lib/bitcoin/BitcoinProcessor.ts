import BitcoinBlockModel from './models/BitcoinBlockModel';
import BitcoinClient from './BitcoinClient';
import BitcoinTransactionModel from './models/BitcoinTransactionModel';
import ErrorCode from './ErrorCode';
import IBitcoinConfig from './IBitcoinConfig';
import LockMonitor from './lock/LockMonitor';
import LockResolver from './lock/LockResolver';
import MongoDbLockTransactionStore from './lock/MongoDbLockTransactionStore';
import MongoDbSlidingWindowQuantileStore from './fee/MongoDbSlidingWindowQuantileStore';
import MongoDbTransactionStore from '../common/MongoDbTransactionStore';
import ProtocolParameters from './ProtocolParameters';
import RequestError from './RequestError';
import ReservoirSampler from './fee/ReservoirSampler';
import ResponseStatus from '../common/enums/ResponseStatus';
import ServiceInfoProvider from '../common/ServiceInfoProvider';
import ServiceVersionModel from '../common/models/ServiceVersionModel';
import SidetreeError from '../common/SidetreeError';
import SharedErrorCode from '../common/SharedErrorCode';
import SidetreeTransactionParser from './SidetreeTransactionParser';
import SlidingWindowQuantileCalculator from './fee/SlidingWindowQuantileCalculator';
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

  /** proof of fee configuration */
  private readonly quantileCalculator: SlidingWindowQuantileCalculator;

  private readonly transactionSampler: ReservoirSampler;

  /** at least 10 blocks per page unless reaching the last block */
  private static readonly pageSizeInBlocks = 10;

  public constructor (config: IBitcoinConfig) {
    this.sidetreePrefix = config.sidetreeTransactionPrefix;
    this.genesisBlockNumber = config.genesisBlockNumber;
    this.transactionStore = new MongoDbTransactionStore(config.mongoDbConnectionString, config.databaseName);

    this.spendingMonitor = new SpendingMonitor(config.bitcoinFeeSpendingCutoffPeriodInBlocks,
      BitcoinClient.convertBtcToSatoshis(config.bitcoinFeeSpendingCutoff),
      this.transactionStore);

    const mongoQuantileStore = new MongoDbSlidingWindowQuantileStore(config.mongoDbConnectionString, config.databaseName);
    this.quantileCalculator = new SlidingWindowQuantileCalculator(BitcoinClient.convertBtcToSatoshis(1),
      ProtocolParameters.windowSizeInGroups,
      ProtocolParameters.quantileMeasure,
      ProtocolParameters.maxQuantileDeviationPercentage,
      config.genesisBlockNumber,
      mongoQuantileStore);
    this.transactionSampler = new ReservoirSampler(ProtocolParameters.sampleSizePerGroup);

    this.pollPeriod = config.transactionPollPeriodInSeconds || 60;
    this.lowBalanceNoticeDays = config.lowBalanceNoticeInDays || 28;
    this.serviceInfoProvider = new ServiceInfoProvider('bitcoin');
    this.bitcoinClient =
      new BitcoinClient(
        config.bitcoinPeerUri,
        config.bitcoinRpcUsername,
        config.bitcoinRpcPassword,
        config.bitcoinWalletImportString,
        config.requestTimeoutInMilliseconds || 300,
        config.requestMaxRetries || 3,
        config.sidetreeTransactionFeeMarkupPercentage || 0);

    this.sidetreeTransactionParser = new SidetreeTransactionParser(this.bitcoinClient);

    this.lockResolver =
      new LockResolver(
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
    await this.transactionStore.initialize();
    await this.quantileCalculator.initialize();
    await this.bitcoinClient.initialize();
    await this.mongoDbLockTransactionStore.initialize();
    await this.lockMonitor.initialize();

    console.debug('Synchronizing blocks for sidetree transactions...');
    const startingBlock = await this.getStartingBlockForInitialization();

    console.info(`Starting block: ${startingBlock.height} (${startingBlock.hash})`);
    await this.processTransactions(startingBlock);

    void this.periodicPoll();
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
    console.info(`Successfully submitted transaction [hash: ${transactionHash}]`);
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

    const blockAfterHistoryOffset = Math.max(block - ProtocolParameters.historicalOffsetInBlocks, 0);
    const groupId = this.getGroupIdFromBlock(blockAfterHistoryOffset);
    const quantileValue = this.quantileCalculator.getQuantile(groupId);

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
      throw new Error('Cannot process Transactions before genesis');
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

  /**
   * For proof of fee calculation, blocks are grouped into fixed sized groups.
   * This function rounds a block to the first block in its group and returns that
   * value.
   */
  private getFirstBlockInGroup (block: number): number {
    const groupId = this.getGroupIdFromBlock(block);
    return groupId * ProtocolParameters.groupSizeInBlocks;
  }

  private async getStartingBlockForInitialization (): Promise<IBlockInfo> {

    // Look in the transaction store to figure out the last block that we need to
    // start from.
    const lastSavedTransaction = (await this.transactionStore.getLastTransaction());

    // If there's nothing saved in the DB then let's start from the genesis block
    if (!lastSavedTransaction) {
      return this.bitcoinClient.getBlockInfoFromHeight(this.genesisBlockNumber);
    }

    // If we are here then it means that there is a potential starting point in the DB.
    // Since we are initializing, it is quite possible that the last block that we processed
    // (and saved in the db) has been forked. Check for the fork.
    const lastSavedBlockIsValid = await this.verifyBlock(lastSavedTransaction.transactionTime, lastSavedTransaction.transactionTimeHash);

    let lastValidBlock: IBlockInfo;

    if (lastSavedBlockIsValid) {
      // There was no fork ... let's put the system DBs in the correct state.
      lastValidBlock = await this.trimDatabasesToFeeSamplingGroupBoundary(lastSavedTransaction.transactionTime);
    } else {
      // There was a fork so we need to revert. The revert function peforms all the correct
      // operations and puts the system in the correct state and returns the last valid block.
      lastValidBlock = await this.revertDatabases();
    }

    // Our starting block is the one after the last-valid-block
    return this.bitcoinClient.getBlockInfoFromHeight(lastValidBlock.height + 1);
  }

  private async getStartingBlockForPeriodicPoll (): Promise<IBlockInfo | undefined> {

    const lastProcessedBlockVerified = await this.verifyBlock(this.lastProcessedBlock!.height, this.lastProcessedBlock!.hash);

    // If the last processed block is not verified then that means that we need to
    // revert the blockchain to the correct block
    if (!lastProcessedBlockVerified) {
      // The revert logic will return the last correct processed block
      this.lastProcessedBlock = await this.revertDatabases();
    }

    // Now that we have the correct last processed block, the new starting block needs
    // to be the one after that one.
    const startingBlockHeight = this.lastProcessedBlock!.height + 1;
    const currentHeight = await this.bitcoinClient.getCurrentBlockHeight();

    // The new starting block-height may not be actually written on the blockchain yet
    // so here we make sure that we don't return an 'invalid' starting block.
    if (startingBlockHeight > currentHeight) {
      return undefined;
    }

    // We have our new starting point
    return this.bitcoinClient.getBlockInfoFromHeight(startingBlockHeight);
  }

  /**
   * Begins to revert databases until consistent with blockchain, returns last good height
   * @returns last valid block height before the fork
   */
  private async revertDatabases (): Promise<IBlockInfo> {
    console.info('Reverting transactions');

    // Keep reverting transactions until a valid transaction is found.
    while (await this.transactionStore.getTransactionsCount() > 0) {
      const exponentiallySpacedTransactions = await this.transactionStore.getExponentiallySpacedTransactions();

      const lastKnownValidTransaction = await this.firstValidTransaction(exponentiallySpacedTransactions);

      if (lastKnownValidTransaction) {
        // We have a valid transaction, so revert the DBs to that valid one and return.
        return this.trimDatabasesToFeeSamplingGroupBoundary(lastKnownValidTransaction.transactionTime);
      }

      // We did not find a valid transaction - revert as much as the lowest height in the exponentially spaced
      // transactions and repeat the process with a new reduced list of transactions.
      const lowestHeight = exponentiallySpacedTransactions[exponentiallySpacedTransactions.length - 1].transactionTime;
      const revertToTransactionNumber = TransactionNumber.construct(lowestHeight, 0);

      console.debug(`Removing transactions since ${TransactionNumber.getBlockNumber(revertToTransactionNumber)}`);
      await this.transactionStore.removeTransactionsLaterThan(revertToTransactionNumber);
    }

    // there are no transactions stored.
    console.info('Reverted all known transactions.');
    return this.bitcoinClient.getBlockInfoFromHeight(this.genesisBlockNumber);
  }

  /**
   * Trims entries from the system DBs to the closest full fee sampling group boundary.
   * @param lastValidBlockNumber The last known valid block number.
   * @returns The last block of the fee sampling group.
   */
  private async trimDatabasesToFeeSamplingGroupBoundary (lastValidBlockNumber: number): Promise<IBlockInfo> {

    console.info(`Reverting quantile and transaction DBs to closest fee sampling group boundary given block: ${lastValidBlockNumber}`);

    // For the quantile DB, we need to remove the full group (corresponding to the given
    // lastValidBlockNumber). This is because currently there is no way to add/remove individual block's
    // data to the quantile DB ... it only expects to work with the full groups. Which means that we
    // need to remove all the transactions which belong to that group (and later ones).
    //
    // So what we need to do is:
    // <code>
    //   validBlockGroup = findGroupForTheBlock(lastValidBlockNumber);
    //   firstBlockInGroup = findFirstBlockInGroup(validBlockGroup);
    //
    //   deleteAllTransactionsGreaterThanOrEqualTo(firstBlockInGroup);
    //   deleteAllGroupsGreaterThanOrEqualTo(validBlockGroup);
    // </code>
    const firstBlockInGroup = this.getFirstBlockInGroup(lastValidBlockNumber);

    // NOTE:
    // *****
    // Make sure that we remove the transaction data BEFORE we remove the quantile data. This is
    // because that if the service stops at any moment after this, the initialize code looks at
    // the transaction store and can revert the quantile db accordingly.
    const firstTxnOfFirstBlockInGroup = TransactionNumber.construct(firstBlockInGroup, 0);

    console.debug(`Removing transactions since ${firstBlockInGroup} (transaction id: ${firstTxnOfFirstBlockInGroup})`);
    await this.transactionStore.removeTransactionsLaterThan(firstTxnOfFirstBlockInGroup - 1);

    // Now revert the corresponding groups (and later) from the quantile calculator.
    const revertToGroupId = this.getGroupIdFromBlock(firstBlockInGroup);

    console.debug(`Removing the quantile data greater and equal than: ${revertToGroupId}`);
    await this.quantileCalculator.removeGroupsGreaterThanOrEqual(revertToGroupId);

    // Reset transaction sampling
    this.transactionSampler.clear();

    // The first block in the group is the new starting point so the previous one is the
    // last 'valid' block. Return it but ensure that we are not going below the genesis block
    const blockNumberToReturn = Math.max(firstBlockInGroup - 1, this.genesisBlockNumber);

    return this.bitcoinClient.getBlockInfoFromHeight(blockNumberToReturn);
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

  private isGroupBoundary (block: number): boolean {
    return (block + 1) % ProtocolParameters.groupSizeInBlocks === 0;
  }

  private getGroupIdFromBlock (block: number): number {
    return Math.floor(block / ProtocolParameters.groupSizeInBlocks);
  }

  private async processBlockForPofCalculation (blockHeight: number, blockData: BitcoinBlockModel): Promise<void> {

    const blockHash = blockData.hash;

    // reseed source of psuedo-randomness to the blockhash
    this.transactionSampler.resetPsuedoRandomSeed(blockHash);

    const transactions = blockData.transactions;

    // First transaction in a block is always the coinbase (miner's) transaction and has no inputs
    // so we are going to ignore that transaction in our calculations.
    for (let transactionIndex = 1; transactionIndex < transactions.length; transactionIndex++) {
      const transaction = transactions[transactionIndex];

      const sidetreeData = await this.sidetreeTransactionParser.parse(transaction, this.sidetreePrefix);
      const isSidetreeTransaction = sidetreeData !== undefined;

      // Add the transaction to the sampler.  We filter out transactions with unusual
      // input count - such transaction require a large number of rpc calls to compute transaction fee
      // not worth the cost for an approximate measure. We also filter out sidetree transactions
      const inputsCount = transaction.inputs.length;

      if (!isSidetreeTransaction &&
          inputsCount <= ProtocolParameters.maxInputCountForSampledTransaction) {
        this.transactionSampler.addElement(transaction.id);
      }
    }

    if (this.isGroupBoundary(blockHeight)) {

      // Compute the transaction fees for sampled transactions of this group
      const sampledTransactionIds = this.transactionSampler.getSample();
      const sampledTransactionFees = new Array();
      for (let transactionId of sampledTransactionIds) {
        const transactionFee = await this.bitcoinClient.getTransactionFeeInSatoshis(transactionId);
        sampledTransactionFees.push(transactionFee);
      }

      const groupId = this.getGroupIdFromBlock(blockHeight);
      await this.quantileCalculator.add(groupId, sampledTransactionFees);

      // Reset the sampler for the next group
      this.transactionSampler.clear();
    }
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
      throw Error(`Previous hash from blockchain: ${blockData.previousHash} is different from the expected value: ${previousBlockHash}`);
    }

    await this.processBlockForPofCalculation(block, blockData);

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

    const sidetreeData = await this.sidetreeTransactionParser.parse(transaction, this.sidetreePrefix);

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

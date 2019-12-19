import BitcoinBlockData from './models/BitcoinBlockData';
import BitcoinClient from './BitcoinClient';
import BitcoinOutputModel from './models/BitcoinOutputModel';
import BitcoinTransactionModel from './models/BitcoinTransactionModel';
import BitcoinUnspentCoinsModel from './models/BitcoinUnspentCoinsModel';
import ErrorCode from '../common/SharedErrorCode';
import MongoDbSlidingWindowQuantileStore from './fee/MongoDbSlidingWindowQuantileStore';
import ProtocolParameters from './ProtocolParameters';
import IBitcoinClient from './interfaces/IBitcoinClient';
import MongoDbTransactionStore from '../common/MongoDbTransactionStore';
import RequestError from './RequestError';
import ReservoirSampler from './fee/ReservoirSampler';
import ServiceInfoProvider from '../common/ServiceInfoProvider';
import ServiceVersionModel from '../common/models/ServiceVersionModel';
import SlidingWindowQuantileCalculator from './fee/SlidingWindowQuantileCalculator';
import TransactionFeeModel from '../common/models/TransactionFeeModel';
import TransactionModel from '../common/models/TransactionModel';
import TransactionNumber from './TransactionNumber';
import { IBitcoinConfig } from './IBitcoinConfig';
import { ResponseStatus } from '../common/Response';

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

  /** Number of items to return per page */
  public pageSize: number;

  /** Number of seconds between transaction queries */
  public pollPeriod: number;

  /** Days of notice before the wallet is depeleted of all funds */
  public lowBalanceNoticeDays: number;

  /** Last seen block */
  private lastProcessedBlock: IBlockInfo | undefined;

  /** Poll timeout identifier */
  private pollTimeoutId: number | undefined;

  private serviceInfoProvider: ServiceInfoProvider;

  private bitcoinClient: IBitcoinClient;

  /** proof of fee configuration */
  private readonly quantileCalculator: SlidingWindowQuantileCalculator;

  private readonly transactionSampler: ReservoirSampler;

  /** satoshis per bitcoin */
  private static readonly satoshiPerBitcoin = 100000000;

  public constructor (config: IBitcoinConfig) {
    this.sidetreePrefix = config.sidetreeTransactionPrefix;
    this.genesisBlockNumber = config.genesisBlockNumber;
    this.transactionStore = new MongoDbTransactionStore(config.mongoDbConnectionString, config.databaseName);

    const mongoQuantileStore = new MongoDbSlidingWindowQuantileStore(config.mongoDbConnectionString, config.databaseName);
    this.quantileCalculator = new SlidingWindowQuantileCalculator(BitcoinProcessor.satoshiPerBitcoin,
      ProtocolParameters.windowSizeInGroups,
      ProtocolParameters.quantileMeasure,
      mongoQuantileStore);
    this.transactionSampler = new ReservoirSampler(ProtocolParameters.sampleSizePerGroup);

    this.pageSize = config.transactionFetchPageSize;
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
        config.requestMaxRetries || 3);
  }

  /**
   * Initializes the Bitcoin processor
   */
  public async initialize () {
    console.debug('Initializing ITransactionStore');
    await this.transactionStore.initialize();
    await this.quantileCalculator.initialize();
    await this.bitcoinClient.initialize();

    console.debug('Synchronizing blocks for sidetree transactions...');
    const startingBlock = await this.getStartingBlockForInitialization();

    console.info(`Starting block: ${startingBlock.height} (${startingBlock.hash})`);
    await this.processTransactions(startingBlock);

    // disabling floating promise lint since periodicPoll should just float in the background event loop
    /* tslint:disable-next-line:no-floating-promises */
    this.periodicPoll();
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

    const height = await this.bitcoinClient.getBlockHeight(hash);

    return {
      hash: hash,
      time: height
    };
  }

  /**
   * Fetches Sidetree transactions in chronological order from since or genesis.
   * @param since A transaction number
   * @param hash The associated transaction time hash
   * @returns Transactions since given transaction number.
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
        throw new RequestError(ResponseStatus.BadRequest, ErrorCode.InvalidTransactionNumberOrTimeHash);
      }
    }

    console.info(`Returning transactions since ${since ? 'block ' + TransactionNumber.getBlockNumber(since) : 'begining'}...`);
    let transactions = await this.transactionStore.getTransactionsLaterThan(since, this.pageSize);
    // filter the results to only return transactions, and not internal data
    transactions = transactions.map((transaction) => {
      return {
        transactionNumber: transaction.transactionNumber,
        transactionTime: transaction.transactionTime,
        transactionTimeHash: transaction.transactionTimeHash,
        anchorString: transaction.anchorString,
        transactionFeePaid: transaction.transactionFeePaid,
        normalizedTransactionFee: transaction.normalizedTransactionFee
      };
    });

    return {
      transactions,
      moreTransactions: transactions.length === this.pageSize
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
   * @param fee The fee to be paid for this transaction.
   */
  public async writeTransaction (anchorString: string, fee: number) {
    console.info(`Fee: ${fee}. Anchoring string ${anchorString}`);
    const sidetreeTransactionString = `${this.sidetreePrefix}${anchorString}`;

    const unspentOutputs = await this.bitcoinClient.getUnspentCoins();

    let totalSatoshis = unspentOutputs.reduce((total: number, coin: BitcoinUnspentCoinsModel) => {
      return total + coin.satoshis;
    }, 0);

    // ----
    // Issue #347 opened to track the investigation for this hardcoded value.
    // Ensure that we are always paying this minimum fee.
    fee = Math.max(fee, 1000);
    // ----

    const estimatedBitcoinWritesPerDay = 6 * 24;
    const lowBalanceAmount = this.lowBalanceNoticeDays * estimatedBitcoinWritesPerDay * fee;
    if (totalSatoshis < lowBalanceAmount) {
      const daysLeft = Math.floor(totalSatoshis / (estimatedBitcoinWritesPerDay * fee));
      console.error(`Low balance (${daysLeft} days remaining),\
 please fund your wallet. Amount: >=${lowBalanceAmount - totalSatoshis} satoshis.`);
    }
    // cannot make the transaction
    if (totalSatoshis < fee) {
      const error = new Error(`Not enough satoshis to broadcast. Failed to broadcast anchor string ${anchorString}`);
      console.error(error);
      throw error;
    }

    const transactionId = await this.bitcoinClient.broadcastTransaction(sidetreeTransactionString, fee);
    console.info(`Successfully submitted transaction ${transactionId}`);
  }

  /**
   * Return proof-of-fee value for a particular block.
   */
  public async getNormalizedFee (block: number): Promise<TransactionFeeModel> {

    if (block < this.genesisBlockNumber) {
      const error = `The input block number must be greater than or equal to: ${this.genesisBlockNumber}`;
      console.error(error);
      throw new RequestError(ResponseStatus.BadRequest, ErrorCode.BlockchainTimeOutOfRange);
    }

    const blockAfterHistoryOffset = Math.max(block - ProtocolParameters.historicalOffsetInBlocks, 0);
    const groupId = this.getGroupIdFromBlock(blockAfterHistoryOffset);
    const quantileValue = this.quantileCalculator.getQuantile(groupId);

    if (quantileValue) {
      return { normalizedTransactionFee: quantileValue };
    }

    console.error(`Unable to get the normalized fee from the quantile calculator for block: ${block}. Seems like that the service isn't ready yet.`);
    throw new RequestError(ResponseStatus.BadRequest, ErrorCode.BlockchainTimeOutOfRange);
  }

  /**
   * Handles the get version operation.
   */
  public async getServiceVersion (): Promise<ServiceVersionModel> {
    return this.serviceInfoProvider.getServiceVersion();
  }

  /**
   * Will process transactions every interval seconds.
   * @param interval Number of seconds between each query
   */
  private async periodicPoll (interval: number = this.pollPeriod) {
    // Defensive programming to prevent multiple polling loops even if this method is externally called multiple times.
    if (this.pollTimeoutId) {
      clearTimeout(this.pollTimeoutId);
    }

    try {
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
   * Processes transactions from startBlock (or genesis) to endBlockHeight (or tip)
   * @param startBlock The block to begin from (inclusive)
   * @param endBlockHeight The blockheight to stop on (inclusive)
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

    for (let blockHeight = startBlockHeight; blockHeight <= endBlockHeight; blockHeight++) {
      const processedBlockHash = await this.processBlock(blockHeight);

      this.lastProcessedBlock = {
        height: blockHeight,
        hash: processedBlockHash
      };
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

    // Assume that we're going to start form the genesis block
    let startingBlock = this.genesisBlockNumber;

    // We look at the latest data that we saved in the quantile calculator. The latest
    // Id in there tells us which group of blocks have been processed.
    const lastSavedGroupId = await this.quantileCalculator.getLastGroupId();

    if (lastSavedGroupId) {
      // Then we need to start from the block corresponding to that groupId
      startingBlock = this.getStartingBlockFromGroupId(lastSavedGroupId);

      // We want to delete the last group Id because we might not have saved all the transaction(s)
      // in that group. So removing that ensures that we redo this block which will ensure that
      // all the transactions are processed again.
      await this.quantileCalculator.removeGroupsGreaterThanOrEqual(lastSavedGroupId);
    }

    // Remove everything after the starting block as we are (re)starting from that point
    const startingBlockFirstTxnNumber = TransactionNumber.construct(startingBlock, 0);
    await this.transactionStore.removeTransactionsLaterThan(startingBlockFirstTxnNumber - 1);

    return {
      height: startingBlock,
      hash: await this.bitcoinClient.getBlockHash(startingBlock)
    };
  }

  private async getStartingBlockForPeriodicPoll (): Promise<IBlockInfo | undefined> {

    const lastProcessedBlockVerified = await this.verifyBlock(this.lastProcessedBlock!.height, this.lastProcessedBlock!.hash);

    // If the last processed block is not verified then that means that we need to
    // revert the blockchain to the correct block
    if (!lastProcessedBlockVerified) {
      // The revert logic will return the last correct processed block
      this.lastProcessedBlock = await this.revertBlockchainCache();
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
    return {
      height: startingBlockHeight,
      hash: await this.bitcoinClient.getBlockHash(startingBlockHeight)
    };
  }

  /**
   * Begins to revert the blockchain cache until consistent, returns last good height
   * @returns last valid block height before the fork
   */
  private async revertBlockchainCache (): Promise<IBlockInfo> {
    console.info('Reverting transactions');

    // Keep reverting transactions until a valid transaction is found.
    while (await this.transactionStore.getTransactionsCount() > 0) {
      const exponentiallySpacedTransactions = await this.transactionStore.getExponentiallySpacedTransactions();

      const firstValidTransaction = await this.firstValidTransaction(exponentiallySpacedTransactions);

      if (firstValidTransaction) {
        // Revert all transactions in blocks from revertToBlockNumber and later. We make make this to be a group
        // boundary to simplify resetting proof-of-fee state which is maintained per group.
        let revertToBlockNumber = this.getFirstBlockInGroup(firstValidTransaction.transactionTime);

        // Revert the quantile calculator. We want to keep the revertToBlock which means that we should
        // keep the corresponding group and delete everything greater than that one.
        //
        // NOTE: Make sure that we remove the groupId data BEFORE we remove the transactions. This is
        // because that if the service stops at any moment after this, the initialize code looks at
        // the groupId and can revert the transactions db accordingly.
        const revertToGroupId = this.getGroupIdFromBlock(revertToBlockNumber);

        console.debug(`Reverting the quantile data greater than: ${revertToGroupId}`);
        await this.quantileCalculator.removeGroupsGreaterThanOrEqual(revertToGroupId + 1);

        // Reset transaction sampling
        this.transactionSampler.clear();

        // The number that represents the theoritical last possible transaction written with a block number
        // less than revertToBlockNumber
        const revertToTransactionNumber = TransactionNumber.construct(revertToBlockNumber + 1, 0) - 1;

        console.debug(`Removing transactions since ${TransactionNumber.getBlockNumber(revertToTransactionNumber)}`);
        await this.transactionStore.removeTransactionsLaterThan(revertToTransactionNumber);

        console.info(`reverted Transactions to block ${revertToBlockNumber}`);
        return {
          height: revertToBlockNumber,
          hash: await this.bitcoinClient.getBlockHash(revertToBlockNumber)
        };
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
    return {
      height: this.genesisBlockNumber,
      hash: await this.bitcoinClient.getBlockHash(this.genesisBlockNumber)
    };
  }

  /**
   * Given a Bitcoin block height and hash, verifies against the blockchain
   * @param height Block height to verify
   * @param hash Block hash to verify
   * @returns true if valid, false otherwise
   */
  private async verifyBlock (height: number, hash: string): Promise<boolean> {
    console.info(`Verifying block ${height} (${hash})`);
    const responseData = await this.bitcoinClient.getBlockHash(height);

    console.debug(`Retrieved block ${height} (${responseData})`);
    return hash === responseData;
  }

  private isSidetreeTransaction (transaction: BitcoinTransactionModel): boolean {
    const transactionOutputs = transaction.outputs;

    for (let outputIndex = 0; outputIndex < transactionOutputs.length; outputIndex++) {

      const data = this.getSidetreeDataFromVOutIfExist(transactionOutputs[outputIndex]);

      // We do not check for multiple sidetree anchors; we would treat such
      // transactions as non-sidetree for updating the transaction store, but here
      // it seems better to consider this as a sidetree transaction and ignore it
      // for sampling purposes to eliminate potentially fraudelent transactions from
      // affecting the sample.
      if (data !== undefined) {
        return true;
      }
    }

    // non sidetree transaction
    return false;
  }

  private getSidetreeDataFromVOutIfExist (transactionOutput: BitcoinOutputModel): string | undefined {

    // check for returned data for sidetree prefix
    const hexDataMatches = transactionOutput.scriptAsmAsString.match(/\s*OP_RETURN ([0-9a-fA-F]+)$/);

    if (hexDataMatches && hexDataMatches.length !== 0) {

      const data = Buffer.from(hexDataMatches[1], 'hex').toString();

      if (data.startsWith(this.sidetreePrefix)) {
        return data.slice(this.sidetreePrefix.length);
      }
    }

    // Nothing was found
    return undefined;
  }

  private isGroupBoundary (block: number): boolean {
    return (block + 1) % ProtocolParameters.groupSizeInBlocks === 0;
  }

  private getGroupIdFromBlock (block: number): number {
    return Math.floor(block / ProtocolParameters.groupSizeInBlocks);
  }

  private getStartingBlockFromGroupId (groupId: number): number {
    return groupId * ProtocolParameters.groupSizeInBlocks;
  }

  private async processBlockForPofCalculation (blockHeight: number, blockData: BitcoinBlockData): Promise<void> {

    const blockHash = blockData.hash;

    // reseed source of psuedo-randomness to the blockhash
    this.transactionSampler.resetPsuedoRandomSeed(blockHash);

    const transactions = blockData.transactions;

    // First transaction in a block is always the coinbase (miner's) transaction and has no inputs
    // so we are going to ignore that transaction in our calculations.
    for (let transactionIndex = 1; transactionIndex < transactions.length; transactionIndex++) {
      const transaction = transactions[transactionIndex];

      const isSidetreeTransaction = this.isSidetreeTransaction(transaction);

      // Add the transaction to the sampler.  We filter out transactions with unusual
      // input count - such transaction require a large number of rpc calls to compute transaction fee
      // not worth the cost for an approximate measure. We also filter out sidetree transactions

      if (!isSidetreeTransaction &&
          transaction.inputs.length <= ProtocolParameters.maxInputCountForSampledTransaction) {
        this.transactionSampler.addElement(transaction.id);
      }
    }

    if (this.isGroupBoundary(blockHeight)) {

      // Compute the transaction fees for sampled transactions of this group
      const sampledTransactionIds = this.transactionSampler.getSample();
      const sampledTransactionFees = new Array();
      for (let transactionId of sampledTransactionIds) {
        const transactionFee = await this.getTransactionFeeInSatoshi(transactionId);
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
   * @returns the block hash processed
   */
  private async processBlock (block: number): Promise<string> {
    console.info(`Processing block ${block}`);
    const hash = await this.bitcoinClient.getBlockHash(block);
    const blockData = await this.bitcoinClient.getBlock(hash);

    await this.processBlockForPofCalculation(block, blockData);

    const transactions = blockData.transactions;
    const blockHash = blockData.hash;

    // console.debug(`Block ${block} contains ${transactions.length} transactions`);

    // iterate through transactions
    for (let transactionIndex = 0; transactionIndex < transactions.length; transactionIndex++) {
      const transaction = transactions[transactionIndex];

      // get the output coins in the transaction
      const outputs = transactions[transactionIndex].outputs;

      if (outputs.length <= 0) {
        // console.debug(`Skipping transaction ${transactionIndex}: no output coins.`);
        continue;
      }

      try {
        await this.addValidSidetreeTransactionsFromVOutsToTransactionStore(outputs, transactionIndex, block, blockHash, transaction.id);

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

  /** Get the transaction out value in satoshi, for a specified output index */
  private async getTransactionOutValueInSatoshi (transactionId: string, outputIndex: number) {
    const transaction = await this.bitcoinClient.getRawTransaction(transactionId);

    // output with the desired index
    const vout = transaction.outputs[outputIndex];

    return vout.satoshis;
  }

  /** Get the transaction fee of a transaction in satoshis */
  private async getTransactionFeeInSatoshi (transactionId: string) {

    const transaction = await this.bitcoinClient.getRawTransaction(transactionId);

    let inputSatoshiSum = 0;
    for (let i = 0 ; i < transaction.inputs.length ; i++) {

      const currentInput = transaction.inputs[i];
      const transactionOutValue = await this.getTransactionOutValueInSatoshi(currentInput.previousTransactionId, currentInput.outputIndexInPreviousTransaction);

      inputSatoshiSum += transactionOutValue;
    }

    // transaction outputs in satoshis
    const transactionOutputs: number[] = transaction.outputs.map((output) => output.satoshis);

    const outputSatoshiSum = transactionOutputs.reduce((sum, value) => sum + value, 0);

    return (inputSatoshiSum - outputSatoshiSum);
  }

  private async addValidSidetreeTransactionsFromVOutsToTransactionStore (
    allVOuts: BitcoinOutputModel[],
    transactionIndex: number,
    transactionBlock: number,
    transactionHash: any,
    transactionId: string): Promise<boolean> {

    let sidetreeTxToAdd: TransactionModel | undefined = undefined;

    for (let outputIndex = 0; outputIndex < allVOuts.length; outputIndex++) {

      const sidetreeData = this.getSidetreeDataFromVOutIfExist(allVOuts[outputIndex]);
      const isSidetreeTx = (sidetreeData !== undefined);
      const oneSidetreeTxAlreadyFound = (sidetreeTxToAdd !== undefined);

      if (isSidetreeTx && oneSidetreeTxAlreadyFound) {
        // tslint:disable-next-line: max-line-length
        const message = `The outputs in block: ${transactionBlock} with transaction id: ${transactionId} has multiple sidetree transactions. So ignoring this transaction.`;
        console.debug(message);
        return false;

      } else if (isSidetreeTx) {
        // we have found a sidetree transaction
        sidetreeTxToAdd = {
          transactionNumber: TransactionNumber.construct(transactionBlock, transactionIndex),
          transactionTime: transactionBlock,
          transactionTimeHash: transactionHash,
          anchorString: sidetreeData as string,

          // We will fill the following information after we have make sure that this is
          // indeed the transaction that we want to return. This is because the calculation
          // of the following properties may be expensive.
          transactionFeePaid: -1,
          normalizedTransactionFee: -1
        };
      }
    }

    if (sidetreeTxToAdd !== undefined) {
      // If we got to here then everything was good and we found only one sidetree transaction, otherwise
      // there would've been an exception before. So let's fill the missing information for the
      // transaction and return it
      const transactionFeePaid = await this.getTransactionFeeInSatoshi(transactionId);
      const normalizedFeeModel = await this.getNormalizedFee(transactionBlock);

      sidetreeTxToAdd.transactionFeePaid = transactionFeePaid;
      sidetreeTxToAdd.normalizedTransactionFee = normalizedFeeModel.normalizedTransactionFee;

      console.debug(`Sidetree transaction found; adding ${JSON.stringify(sidetreeTxToAdd)}`);
      await this.transactionStore.addTransaction(sidetreeTxToAdd);

      return true;
    }

    // non sidetree transaction
    return false;
  }

}

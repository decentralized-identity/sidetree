import * as httpStatus from 'http-status';
import ErrorCode from '../common/SharedErrorCode';
import MongoDbSlidingWindowQuantileStore from './fee/MongoDbSlidingWindowQuantileStore';
import MongoDbTransactionStore from '../common/MongoDbTransactionStore';
import nodeFetch, { FetchError, Response, RequestInit } from 'node-fetch';
import ProtocolParameters from './ProtocolParameters';
import ReadableStream from '../common/ReadableStream';
import RequestError from './RequestError';
import ReservoirSampler from './fee/ReservoirSampler';
import ServiceInfo from '../common/ServiceInfoProvider';
import ServiceVersionModel from '../common/models/ServiceVersionModel';
import SlidingWindowQuantileCalculator from './fee/SlidingWindowQuantileCalculator';
import TransactionFeeModel from '../common/models/TransactionFeeModel';
import TransactionModel from '../common/models/TransactionModel';
import TransactionNumber from './TransactionNumber';
import { Address, Networks, PrivateKey, Script, Transaction } from 'bitcore-lib';
import { IBitcoinConfig } from './IBitcoinConfig';
import { ResponseStatus } from '../common/Response';
import { URL } from 'url';

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

  /** URI for the bitcoin peer's RPC endpoint */
  public readonly bitcoinPeerUri: string;

  /** Bitcoin peer's RPC basic authorization credentials */
  public readonly bitcoinAuthorization?: string;

  /** Prefix used to identify Sidetree transactions in Bitcoin's blockchain. */
  public readonly sidetreePrefix: string;

  /** The first Sidetree block in Bitcoin's blockchain. */
  public readonly genesisBlockNumber: number;

  /** Store for the state of sidetree transactions. */
  private readonly transactionStore: MongoDbTransactionStore;

  /** Wallet private key */
  private readonly privateKey: PrivateKey;

  /** Number of items to return per page */
  public pageSize: number;

  /** request timeout in milliseconds */
  public requestTimeout: number;

  /** maximum number of request retries */
  public maxRetries: number;

  /** Number of seconds between transaction queries */
  public pollPeriod: number;

  /** Days of notice before the wallet is depeleted of all funds */
  public lowBalanceNoticeDays: number;

  /** Last seen block */
  private lastProcessedBlock: IBlockInfo | undefined;

  /** Poll timeout identifier */
  private pollTimeoutId: number | undefined;

  private serviceInfo: ServiceInfo;

  /** proof of fee configuration */
  private readonly quantileCalculator: SlidingWindowQuantileCalculator;

  private readonly transactionSampler: ReservoirSampler;

  /** satoshis per bitcoin */
  private static readonly satoshiPerBitcoin = 100000000;

  public constructor (config: IBitcoinConfig) {
    this.bitcoinPeerUri = config.bitcoinPeerUri;
    if (config.bitcoinRpcUsername && config.bitcoinRpcPassword) {
      this.bitcoinAuthorization = Buffer.from(`${config.bitcoinRpcUsername}:${config.bitcoinRpcPassword}`).toString('base64');
    }
    this.sidetreePrefix = config.sidetreeTransactionPrefix;
    this.genesisBlockNumber = config.genesisBlockNumber;
    this.transactionStore = new MongoDbTransactionStore(config.mongoDbConnectionString, config.databaseName);

    const mongoQuantileStore = new MongoDbSlidingWindowQuantileStore(config.mongoDbConnectionString, config.databaseName);
    this.quantileCalculator = new SlidingWindowQuantileCalculator(BitcoinProcessor.satoshiPerBitcoin,
      ProtocolParameters.windowSizeInGroups,
      ProtocolParameters.quantileMeasure,
      mongoQuantileStore);
    this.transactionSampler = new ReservoirSampler(ProtocolParameters.sampleSizePerGroup);

    /// Bitcore has a type file error on PrivateKey
    try {
      this.privateKey = (PrivateKey as any).fromWIF(config.bitcoinWalletImportString);
    } catch (error) {
      throw new Error(`Failed creating private key from '${config.bitcoinWalletImportString}': ${error.message}`);
    }
    this.pageSize = config.transactionFetchPageSize;
    this.requestTimeout = config.requestTimeoutInMilliseconds || 300;
    this.maxRetries = config.requestMaxRetries || 3;
    this.pollPeriod = config.transactionPollPeriodInSeconds || 60;
    this.lowBalanceNoticeDays = config.lowBalanceNoticeInDays || 28;
    this.serviceInfo = new ServiceInfo('bitcoin');
  }

  /**
   * generates a private key in WIF format
   * @param network Which bitcoin network to generate this key for
   */
  public static generatePrivateKey (network: 'mainnet' | 'livenet' | 'testnet' | undefined): string {
    let bitcoreNetwork: Networks.Network | undefined;
    switch (network) {
      case 'mainnet':
        bitcoreNetwork = Networks.mainnet;
        break;
      case 'livenet':
        bitcoreNetwork = Networks.livenet;
        break;
      case 'testnet':
        bitcoreNetwork = Networks.testnet;
        break;
    }
    return new PrivateKey(undefined, bitcoreNetwork).toWIF();
  }

  /**
   * Initializes the Bitcoin processor
   */
  public async initialize () {
    console.debug('Initializing ITransactionStore');
    await this.transactionStore.initialize();
    await this.quantileCalculator.initialize();

    const address = this.privateKey.toAddress();
    console.debug(`Checking if bitcoin contains a wallet for ${address}`);
    if (!await this.walletExists(address.toString())) {
      console.debug(`Configuring bitcoin peer to watch address ${address}. This can take up to 10 minutes.`);
      const request = {
        method: 'importpubkey',
        params: [
          this.privateKey.toPublicKey().toBuffer().toString('hex'),
          'sidetree',
          true
        ]
      };
      await this.rpcCall(request, undefined, false);
    } else {
      console.debug('Wallet found.');
    }

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
      const blockHeight = await this.getCurrentBlockHeight();
      hash = await this.getBlockHash(blockHeight);
      return {
        time: blockHeight,
        hash
      };
    }
    const request = {
      method: 'getblock',
      params: [
        hash, // hash of the block
        1 // 1 = block information
      ]
    };
    const response = await this.rpcCall(request);
    return {
      hash: response.hash,
      time: response.height
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

    const address = this.privateKey.toAddress();
    const unspentOutputs = await this.getUnspentCoins(address);

    let totalSatoshis = unspentOutputs.reduce((total: number, coin: Transaction.UnspentOutput) => {
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
 please fund your wallet. Amount: >=${lowBalanceAmount - totalSatoshis} satoshis, Address: ${address.toString()}`);
    }
    // cannot make the transaction
    if (totalSatoshis < fee) {
      const error = new Error(`Not enough satoshis to broadcast. Failed to broadcast anchor string ${anchorString}`);
      console.error(error);
      throw error;
    }

    const transaction = new Transaction();
    transaction.from(unspentOutputs);
    transaction.addOutput(new Transaction.Output({
      script: Script.buildDataOut(sidetreeTransactionString),
      satoshis: 0
    }));
    transaction.change(address);
    transaction.fee(fee);
    transaction.sign(this.privateKey);

    if (!await this.broadcastTransaction(transaction)) {
      const error = new Error(`Could not broadcast transaction ${transaction.toString()}`);
      console.error(error);
      throw error;
    }
    console.info(`Successfully submitted transaction ${transaction.id}`);
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
    return this.serviceInfo.getServiceVersion();
  }

  /**
   * Gets the block hash for a given block height
   * @param height The height to get a hash for
   * @returns the block hash
   */
  private async getBlockHash (height: number): Promise<string> {
    console.info(`Getting hash for block ${height}`);
    const hashRequest = {
      method: 'getblockhash',
      params: [
        height // height of the block
      ]
    };
    return this.rpcCall(hashRequest);
  }

  /**
   * Gets all unspent coins of a given address
   * @param address Bitcoin address to get coins for
   */
  private async getUnspentCoins (address: Address): Promise<Transaction.UnspentOutput[]> {

    // Retrieve all transactions by addressToSearch via BCoin Node API /tx/address/$address endpoint
    const addressToSearch = address.toString();
    console.info(`Getting unspent coins for ${addressToSearch}`);
    const request = {
      method: 'listunspent',
      params: [
        null,
        null,
        [addressToSearch]
      ]
    };
    const response: Array<any> = await this.rpcCall(request);

    const unspentTransactions = response.map((coin) => {
      return new Transaction.UnspentOutput(coin);
    });

    console.info(`Returning ${unspentTransactions.length} coins`);

    return unspentTransactions;
  }

  /**
   * Broadcasts a transaction to the bitcoin network
   * @param transaction Transaction to broadcast
   */
  private async broadcastTransaction (transaction: Transaction): Promise<boolean> {
    const rawTransaction = transaction.serialize();
    console.info(`Broadcasting transaction ${transaction.id}`);
    const request = {
      method: 'sendrawtransaction',
      params: [
        rawTransaction
      ]
    };
    const response = await this.rpcCall(request);

    return response.length > 0;
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

    const endBlockHeight = await this.getCurrentBlockHeight();
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
      hash: await this.getBlockHash(startingBlock)
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
    const currentHeight = await this.getCurrentBlockHeight();

    if (startingBlockHeight > currentHeight) {
      return undefined;
    }

    // We have our new starting point
    return {
      height: startingBlockHeight,
      hash: await this.getBlockHash(startingBlockHeight)
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
          hash: await this.getBlockHash(revertToBlockNumber)
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
      hash: await this.getBlockHash(this.genesisBlockNumber)
    };
  }

  /**
   * Gets the current Bitcoin block height
   * @returns the latest block number
   */
  private async getCurrentBlockHeight (): Promise<number> {
    console.info('Getting current block height...');
    const request = {
      method: 'getblockcount'
    };
    const response = await this.rpcCall(request);
    return response;
  }

  /**
   * Given a Bitcoin block height and hash, verifies against the blockchain
   * @param height Block height to verify
   * @param hash Block hash to verify
   * @returns true if valid, false otherwise
   */
  private async verifyBlock (height: number, hash: string): Promise<boolean> {
    console.info(`Verifying block ${height} (${hash})`);
    const responseData = await this.getBlockHash(height);

    console.debug(`Retrieved block ${height} (${responseData})`);
    return hash === responseData;
  }

  private isSidetreeTransaction (transaction: any): boolean {
    const transactionOutputs = transaction.vout as Array<any>;

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

  private getSidetreeDataFromVOutIfExist (transactionOutput: any): string | undefined {
      // grab the scripts
    const script = transactionOutput.scriptPubKey;

    // check for returned data for sidetree prefix
    const hexDataMatches = script.asm.match(/\s*OP_RETURN ([0-9a-fA-F]+)$/);

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

  private async processBlockForPofCalculation (blockHeight: number, blockData: any): Promise<void> {

    const blockHash = blockData.hash as string;

    // reseed source of psuedo-randomness to the blockhash
    this.transactionSampler.resetPsuedoRandomSeed(blockHash);

    const transactions = blockData.tx as Array<any>;

    // First transaction in a block is always the coinbase (miner's) transaction and has no inputs
    // so we are going to ignore that transaction in our calculations.
    for (let transactionIndex = 1; transactionIndex < transactions.length; transactionIndex++) {
      const transaction = transactions[transactionIndex];

      const isSidetreeTransaction = this.isSidetreeTransaction(transaction);

      // Add the transaction to the sampler.  We filter out transactions with unusual
      // input count - such transaction require a large number of rpc calls to compute transaction fee
      // not worth the cost for an approximate measure. We also filter out sidetree transactions
      const inputsCount = (transaction.vin as Array<any>).length;

      if (!isSidetreeTransaction && inputsCount <= ProtocolParameters.maxInputCountForSampledTransaction) {
        this.transactionSampler.addElement(transaction.txid);
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
    const hash = await this.getBlockHash(block);
    const responseData = await this.rpcCall({
      method: 'getblock',
      params: [
        hash,  // hash
        2      // block and transaction information
      ]
    });

    await this.processBlockForPofCalculation(block, responseData);

    const transactions = responseData.tx as Array<any>;
    const blockHash = responseData.hash;

    // console.debug(`Block ${block} contains ${transactions.length} transactions`);

    // iterate through transactions
    for (let transactionIndex = 0; transactionIndex < transactions.length; transactionIndex++) {
      const transaction = transactions[transactionIndex];

      // get the output coins in the transaction
      if (!('vout' in transaction)) {
        // console.debug(`Skipping transaction ${transactionIndex}: no output coins.`);
        continue;
      }

      try {
        const outputs = transaction.vout as Array<any>;

        await this.addValidSidetreeTransactionsFromVOutsToTransactionStore(outputs, transactionIndex, block, blockHash, transaction.txid);

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
    const transaction = await this.rpcCall({
      method: 'getrawtransaction',
      params: [
        transactionId,  // transaction id
        true   // verbose
      ]
    });

    // output with the desired index
    const vout = transaction.vout.find((v: any) => v.n === outputIndex);

    return Math.round(vout.value * BitcoinProcessor.satoshiPerBitcoin);
  }

  /** Get the transaction fee of a transaction in satoshis */
  private async getTransactionFeeInSatoshi (transactionId: string) {
    const transaction = await this.rpcCall({
      method: 'getrawtransaction',
      params: [
        transactionId,  // transaction id
        true   // verbose
      ]
    });

    let inputSatoshiSum = 0;
    for (let i = 0 ; i < transaction.vin.length ; i++) {
      const transactionOutValue = await this.getTransactionOutValueInSatoshi(transaction.vin[i].txid, transaction.vin[i].vout);
      inputSatoshiSum += transactionOutValue;
    }

    // transaction outputs in satoshis
    const transactionOutputs: number[] = transaction.vout.map((v: any) => Math.round((v.value as number) * BitcoinProcessor.satoshiPerBitcoin));

    const outputSatoshiSum = transactionOutputs.reduce((sum, value) => sum + value, 0);

    return (inputSatoshiSum - outputSatoshiSum);
  }

  private async addValidSidetreeTransactionsFromVOutsToTransactionStore (
    allVOuts: Array<any>,
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

  /**
   * Checks if the bitcoin peer has a wallet open for a given address
   * @param address The bitcoin address to check
   * @returns true if a wallet exists, false otherwise.
   */
  private async walletExists (address: string): Promise<boolean> {
    console.info(`Checking if bitcoin wallet for ${address} exists`);
    const request = {
      method: 'getaddressinfo',
      params: [
        address
      ]
    };

    const response = await this.rpcCall(request);
    return response.labels.length > 0 || response.iswatchonly;
  }

  /**
   * performs an RPC call given a request
   * @param request RPC request parameters as an object
   * @param path optional path extension
   * @returns response as an object
   */
  private async rpcCall (request: any, requestPath: string = '', timeout: boolean = true): Promise<any> {
    // append some standard jrpc parameters
    request['jsonrpc'] = '1.0';
    request['id'] = Math.round(Math.random() * Number.MAX_SAFE_INTEGER).toString(32);
    const fullPath = new URL(requestPath, this.bitcoinPeerUri);
    const requestString = JSON.stringify(request);
    // console.debug(`Fetching ${fullPath}`);
    // console.debug(requestString);
    console.debug(`Sending jRPC request id: ${request.id}, method: ${request['method']}`);
    const requestOptions: RequestInit = {
      body: requestString,
      method: 'post'
    };
    if (this.bitcoinAuthorization) {
      requestOptions.headers = {
        Authorization: `Basic ${this.bitcoinAuthorization}`
      };
    }
    const response = await this.fetchWithRetry(fullPath.toString(), requestOptions, timeout);

    const responseData = await ReadableStream.readAll(response.body);
    if (response.status !== httpStatus.OK) {
      const error = new Error(`Fetch failed [${response.status}]: ${responseData}`);
      console.error(error);
      throw error;
    }

    const responseJson = JSON.parse(responseData.toString());

    if ('error' in responseJson && responseJson.error !== null) {
      const error = new Error(`RPC failed: ${JSON.stringify(responseJson.error)}`);
      console.error(error);
      throw error;
    }

    return responseJson.result;
  }

  /**
   * Calls `nodeFetch` and retries with exponential back-off on `request-timeout` FetchError`.
   * @param uri URI to fetch
   * @param requestParameters Request parameters to use
   * @param setTimeout True to set a timeout on the request, and retry if times out, false to wait indefinitely.
   * @returns Response of the fetch
   */
  private async fetchWithRetry (uri: string, requestParameters?: RequestInit | undefined, setTimeout: boolean = true): Promise<Response> {
    let retryCount = 0;
    let timeout: number;
    do {
      timeout = this.requestTimeout * 2 ** retryCount;
      let params = Object.assign({}, requestParameters);
      if (setTimeout) {
        params = Object.assign(params, {
          timeout
        });
      }
      try {
        return await nodeFetch(uri, params);
      } catch (error) {
        if (error instanceof FetchError) {
          if (retryCount >= this.maxRetries) {
            console.debug('Max retries reached. Request failed.');
            throw error;
          }
          switch (error.type) {
            case 'request-timeout':
              console.debug(`Request timeout (${retryCount})`);
              await this.waitFor(Math.round(timeout));
              console.debug(`Retrying request (${++retryCount})`);
              continue;
          }
        }
        console.error(error);
        throw error;
      }
    } while (true);
  }

  /**
   * Async timeout
   * @param milliseconds Timeout in milliseconds
   */
  private async waitFor (milliseconds: number) {
    return new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    });
  }

}

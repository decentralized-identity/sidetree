import { IBitcoinConfig } from './BitcoinConfig';
import TransactionNumber from './TransactionNumber';
import { ITransaction } from '../core/Transaction';
import SidetreeError from '../core/util/SidetreeError';
import MongoDbTransactionStore from '../core/MongoDbTransactionStore';
import nodeFetch from 'node-fetch';
import ReadableStreamUtils from '../core/util/ReadableStreamUtils';

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
 * Processor for Bitcoin REST API calls
 */
export default class BitcoinProcessor {

  /** URI for the bcoin service */
  public readonly bcoinServiceUri: string;
  /** Prefix used to identify Sidetree transactions in Bitcoin's blockchain. */
  public readonly sidetreePrefix: string;
  /** The first Sidetree transaction number in Bitcoin's blockchain. */
  public readonly genesisTransactionNumber: number;
  /** The corresponding time hash of genesis transaction number. */
  public readonly genesisTimeHash: string;
  /** Store for the state of sidetree transactions. */
  private readonly transactionStore: MongoDbTransactionStore;

  /** Number of items to return per page */
  public pageSize: number;

  public constructor (config: IBitcoinConfig) {
    this.bcoinServiceUri = config.bcoinExtensionUri;
    this.sidetreePrefix = config.sidetreeTransactionPrefix;
    this.genesisTransactionNumber = TransactionNumber.construct(config.genesisBlockNumber, 0);
    this.genesisTimeHash = config.genesisBlockHash;
    this.transactionStore = new MongoDbTransactionStore(config.mongoDbConnectionString, config.databaseName);
    this.pageSize = config.maxSidetreeTransactions;
  }

  /**
   * Initializes the Bitcoin processor
   */
  public async initialize () {
    await this.transactionStore.initialize();
    const lastKnownTransaction = await this.transactionStore.getLastTransaction();
    let startSyncBlockHeight = lastKnownTransaction ? lastKnownTransaction.transactionNumber : TransactionNumber.getBlockNumber(this.genesisTransactionNumber);
    let startSyncBlockHash = lastKnownTransaction ? lastKnownTransaction.transactionTimeHash : this.genesisTimeHash;
    await this.processTransactions(startSyncBlockHeight, startSyncBlockHash);
  }

  /**
   * Gets the latest logical blockchain time.
   * @param hash time blockchain time hash
   * @returns the current or associated blockchain time and blockchain hash
   */
  public async time (hash?: string): Promise<IBlockchainTime> {
    let request: any;
    if (hash) {
      request = {
        method: 'getblock',
        params: [
          hash, // hash of the block
          true, // block details
          false // transaction details
        ]
      };

    } else {
      const tip = await this.getTip();
      request = {
        method: 'getblockbyheight',
        params: [
          tip,  // height of the block
          true, // block details
          false // transaction details
        ]
      };
    }
    const response = await this.bcoinFetch(request);
    return {
      hash: response.hash,
      time: response.height
    };
  }

  /**
   * Fetches Sidetree transactions in chronological order from since or genesis.
   * @param since A transaction number
   * @param hash The associated transaction time hash
   * @returns Transactions since that blocktime
   */
  public async transactions (since?: number, hash?: string): Promise<{
    moreTransactions: boolean,
    transactions: ITransaction[]
  }> {
    if (since && !hash) {
      throw new SidetreeError(httpStatus.BAD_REQUEST);
    }
    if (!since || !hash) {
      since = this.genesisTransactionNumber;
      hash = this.genesisTimeHash;
    }

    if (!await this.verifyBlock(TransactionNumber.getBlockNumber(since), hash)) {
      throw new SidetreeError(httpStatus.BAD_REQUEST);
    }

    const transactions = await this.transactionStore.getTransactionsLaterThan(since, this.pageSize);

    return {
      transactions,
      moreTransactions: transactions.length === this.pageSize
    };
  }

  /**
   * Given a list of Sidetree transactions, returns the first transaction in the list that is valid.
   * @param transactions List of transactions to check
   * @returns The first valid transaction, or undefined if none are valid
   */
  public async firstValidTransaction (transactions: ITransaction[]): Promise<ITransaction | undefined> {
    // sort so lower transaction numbers come first
    const sortedTransactions = transactions.sort((aTransaction, bTransaction) => {
      // <0  a comes before b
      // >0  b comes before a
      return aTransaction.transactionNumber - bTransaction.transactionNumber;
    });

    for (let index = sortedTransactions.length - 1; index >= 0; index--) {
      const transaction = sortedTransactions[index];
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
   * @param anchorFileHash The hash of a Sidetree anchor file
   */
  public async writeTransaction (anchorFileHash: string): Promise<void> {
    throw new Error(`not implemented; cannot anchor ${anchorFileHash}`);
  }

  /**
   * Processes transactions from startBlock to endBlock or tip
   * @param startBlock The block height to begin from
   * @param startBlockHash The block hash to begin from
   * @param endBlock The blockheight to stop on (inclusive)
   */
  private async processTransactions (startBlock: number, startBlockHash: string, endBlock?: number) {
    const startValid = await this.verifyBlock(startBlock, startBlockHash);
    let beginBlock = startBlock;
    if (!startValid) {
      beginBlock = await this.revertBlockchainCache();
    }
    if (!endBlock) {
      endBlock = await this.getTip();
    }

    // You can parrallelize this so long as all processBlock's don't throw
    for (let blockHeight = beginBlock; blockHeight < endBlock; blockHeight++) {
      await this.processBlock(blockHeight);
    }
  }

  /**
   * Begins to revert the blockchain cache until consistent, returns last good height
   * @returns last valid block height before the fork
   */
  private async revertBlockchainCache (): Promise<number> {
    while (await this.transactionStore.getTransactionsCount() > 0) {
      const exponentiallySpacedTransactions = await this.transactionStore.getExponentiallySpacedTransactions();

      const firstValidTransaction = await this.firstValidTransaction(exponentiallySpacedTransactions);

      let revertToTransactionNumber: number;

      if (firstValidTransaction) {
        revertToTransactionNumber = firstValidTransaction.transactionNumber;
      } else {
        const lowestHeight = exponentiallySpacedTransactions.reduce((height: number, transaction: ITransaction): number => {
          return height < transaction.transactionTime ? height : transaction.transactionTime;
        }, exponentiallySpacedTransactions[0].transactionTime);
        revertToTransactionNumber = TransactionNumber.construct(lowestHeight, 0);
      }

      await this.transactionStore.removeTransactionsLaterThan(revertToTransactionNumber);

      if (firstValidTransaction) {
        return firstValidTransaction.transactionTime;
      }
    }
    // there are no transactions stored.
    return TransactionNumber.getBlockNumber(this.genesisTransactionNumber);
  }

  /**
   * Gets the current Bitcoin tip height
   * @returns the latest block number
   */
  private async getTip (): Promise<number> {
    const request = JSON.stringify({
      method: 'getblockcount'
    });
    const height = await nodeFetch(this.bcoinServiceUri, {
      body: request,
      method: 'post'
    });
    return JSON.parse(await ReadableStreamUtils.readAll(height.body));
  }

  /**
   * Given a Bitcoin block height and hash, verifies against the blockchain
   * @param height Block height to verify
   * @param hash Block hash to verify
   * @returns true if valid, false otherwise
   */
  private async verifyBlock (height: number, hash: string): Promise<boolean> {
    const responseData = await this.bcoinFetch({
      method: 'getblockbyheight',
      params: [
        height,  // height
        true,   // verbose (block details)
        false    // details (transaction details)
      ]
    });

    let actualHash: string = responseData.hash;
    return hash === actualHash;
  }

  /**
   * Given a Bitcoin block height, processes that block for Sidetree transactions
   * @param block Block height to process
   */
  private async processBlock (block: number) {
    const responseData = await this.bcoinFetch({
      method: 'getblockbyheight',
      params: [
        block,  // height
        true,   // verbose (block details)
        true    // details (transaction details)
      ]
    });

    const blockData = JSON.parse(responseData);
    const transactions = blockData.result.tx as Array<any>;
    const blockHash = blockData.result.hash;
    let anchorFilePosition = 0;

    // iterate through transactions
    for (let transactionIndex = 0; transactionIndex < transactions.length; transactionIndex++) {
      // get the output coins in the transaction
      const outputs = transactions[transactionIndex].vout as Array<any>;
      for (let outputIndex = 0; outputIndex < outputs.length; outputIndex++) {
        // grab the scripts
        const script = outputs[outputIndex].scriptPubKey;
        // check for returned data for sidetree prefix
        const hexDataMatches = script.asm.match(/\s*OP_RETURN(.*)$/);
        if (hexDataMatches.length === 0) {
          continue;
        }
        const data = Buffer.from(hexDataMatches[0], 'hex').toString();
        if (data.startsWith(this.sidetreePrefix)) {
          // we have found a sidetree transaction
          const sidetreeTransaction: ITransaction = {
            transactionNumber: TransactionNumber.construct(block, anchorFilePosition),
            transactionTime: block,
            transactionTimeHash: blockHash,
            anchorFileHash: data.slice(this.sidetreePrefix.length)
          };
          anchorFilePosition++;
          await this.transactionStore.addTransaction(sidetreeTransaction);
        }
      }
    }
  }

  /**
   * performs an RPC call given a request
   * @param request RPC request parameters as an object
   * @param path optional path extension
   * @returns response as an object
   */
  private async bcoinFetch (request: any, path: string = ''): Promise<any> {
    const fullPath = path.concat(this.bcoinServiceUri, path);
    const response = await nodeFetch(fullPath, {
      body: JSON.stringify(request),
      method: 'post'
    });

    const responseData = await ReadableStreamUtils.readAll(response.body);
    if (response.status !== httpStatus.OK) {
      const error = new SidetreeError(response.status, responseData);
      console.log(error);
      throw error;
    }

    return JSON.parse(responseData);
  }

}

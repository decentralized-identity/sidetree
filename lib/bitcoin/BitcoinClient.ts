import * as httpStatus from 'http-status';
import BitcoinBlockModel from './models/BitcoinBlockModel';
import BitcoinInputModel from './models/BitcoinInputModel';
import BitcoinOutputModel from './models/BitcoinOutputModel';
import BitcoinTransactionModel from './models/BitcoinTransactionModel';
import nodeFetch, { FetchError, Response, RequestInit } from 'node-fetch';
import ReadableStream from '../common/ReadableStream';
import { Address, Networks, PrivateKey, Script, Transaction } from 'bitcore-lib';
import { IBlockInfo } from './BitcoinProcessor';

/**
 * Encapsulates functionality for reading/writing to the bitcoin ledger.
 */
export default class BitcoinClient {

  /** Bitcoin peer's RPC basic authorization credentials */
  private readonly bitcoinAuthorization?: string;

  /** Wallet private key */
  private readonly privateKey: PrivateKey;
  private readonly privateKeyAddress: Address;

  constructor (
    private bitcoinPeerUri: string,
    bitcoinRpcUsername: string | undefined,
    bitcoinRpcPassword: string | undefined,
    bitcoinWalletImportString: string,
    private requestTimeout: number,
    private requestMaxRetries: number) {

    // Bitcore has a type file error on PrivateKey
    try {
      this.privateKey = (PrivateKey as any).fromWIF(bitcoinWalletImportString);
    } catch (error) {
      throw new Error(`Failed creating private key from '${bitcoinWalletImportString}': ${error.message}`);
    }

    this.privateKeyAddress = this.privateKey.toAddress();

    if (bitcoinRpcUsername && bitcoinRpcPassword) {
      this.bitcoinAuthorization = Buffer.from(`${bitcoinRpcUsername}:${bitcoinRpcPassword}`).toString('base64');
    }
  }

  /**
   * Initialize this bitcoin client.
   */
  public async initialize (): Promise<void> {

    console.debug(`Checking if bitcoin contains a wallet for ${this.privateKeyAddress}`);
    if (!await this.isAddressAddedToWallet(this.privateKeyAddress.toString())) {
      console.debug(`Configuring bitcoin peer to watch address ${this.privateKeyAddress}. This can take up to 10 minutes.`);

      const publicKeyAsHex = this.privateKey.toPublicKey().toBuffer().toString('hex');
      await this.addWatchOnlyAddressToWallet(publicKeyAsHex, true);
    } else {
      console.debug('Wallet found.');
    }
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
   * Broadcasts a transaction to the bitcoin network.
   * @param transactionData The data to write to the transaction
   * @param feeInSatoshis The fee for the transaction in satoshis
   * @returns The hash of the transaction if broadcasted successfully.
   */
  public async broadcastTransaction (transactionData: string, feeInSatoshis: number): Promise<string> {

    const transaction = await this.createBitcoreTransaction(transactionData, feeInSatoshis);
    const rawTransaction = transaction.serialize();

    console.info(`Broadcasting transaction ${transaction.id}`);

    const request = {
      method: 'sendrawtransaction',
      params: [
        rawTransaction
      ]
    };

    return this.rpcCall(request, true);
  }

  /**
   * Gets the block data for the given block hash.
   * @param hash The hash of the block
   * @returns the block data.
   */
  public async getBlock (hash: string): Promise<BitcoinBlockModel> {
    const request = {
      method: 'getblock',
      params: [
        hash,
        2 // verbosity value to get block + transactions' info
      ]
    };

    const block = await this.rpcCall(request, true);

    const transactionModels = block.tx.map((txn: any) => {
      const transactionBuffer = Buffer.from(txn.hex, 'hex');
      const bitcoreTransaction = BitcoinClient.createBitcoreTransactionFromBuffer(transactionBuffer);
      return BitcoinClient.createBitcoinTransactionModel(bitcoreTransaction);
    });

    return {
      hash: block.hash,
      height: block.height,
      previousHash: block.previousblockhash,
      transactions: transactionModels
    };
  }

  /**
   * Gets the block hash for a given block height.
   * @param height The height to get a hash for
   * @returns the block hash
   */
  public async getBlockHash (height: number): Promise<string> {
    console.info(`Getting hash for block ${height}`);
    const hashRequest = {
      method: 'getblockhash',
      params: [
        height // height of the block
      ]
    };

    return this.rpcCall(hashRequest, true);
  }

  /**
   * Gets the block info for the given block height.
   * @param height The height of the block
   * @returns the block info.
   */
  public async getBlockInfoFromHeight (height: number): Promise<IBlockInfo> {
    return this.getBlockInfo(await this.getBlockHash(height));
  }

  /**
   * Gets the block info for the given block hash.
   * @param hash The hash of the block
   * @returns the block info.
   */
  public async getBlockInfo (hash: string): Promise<IBlockInfo> {
    const request = {
      method: 'getblockheader',
      params: [
        hash,
        true // verbose
      ]
    };

    const response = await this.rpcCall(request, true);

    return {
      hash: hash,
      height: response.height,
      previousHash: response.previousblockhash
    };
  }

  /**
   * Gets the current Bitcoin block height
   * @returns the latest block number
   */
  public async getCurrentBlockHeight (): Promise<number> {
    console.info('Getting current block height...');
    const request = {
      method: 'getblockcount'
    };

    const response = await this.rpcCall(request, true);
    return response;
  }

  /**
   * Gets all unspent coins of the wallet which is being watched.
   * @returns the balance of the wallet
   */
  public async getBalanceInSatoshis (): Promise<number> {

    const unspentOutputs = await this.getUnspentOutputs(this.privateKeyAddress);

    const unspentSatoshis = unspentOutputs.reduce((total, unspentOutput) => {
      return total + unspentOutput.satoshis;
    }, 0);

    return unspentSatoshis;
  }

  /**
   * Gets the transaction fee of a transaction in satoshis.
   * @param transactionId the id of the target transaction.
   * @returns the transaction fee.
   */
  public async getTransactionFeeInSatoshis (transactionId: string): Promise<number> {

    const transaction = await this.getRawTransaction(transactionId);

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

  private async addWatchOnlyAddressToWallet (publicKeyAsHex: string, rescan: boolean): Promise<void> {
    const request = {
      method: 'importpubkey',
      params: [
        publicKeyAsHex,
        'sidetree',
        rescan
      ]
    };

    await this.rpcCall(request, false);
  }

  private async isAddressAddedToWallet (address: string): Promise<boolean> {
    console.info(`Checking if bitcoin wallet for ${address} exists`);
    const request = {
      method: 'getaddressinfo',
      params: [
        address
      ]
    };

    const response = await this.rpcCall(request, true);
    return response.labels.length > 0 || response.iswatchonly;
  }

  /** Get the transaction out value in satoshi, for a specified output index */
  private async getTransactionOutValueInSatoshi (transactionId: string, outputIndex: number) {
    const transaction = await this.getRawTransaction(transactionId);

    // output with the desired index
    const vout = transaction.outputs[outputIndex];

    return vout.satoshis;
  }

  /**
   * Get the raw transaction data.
   * @param transactionId The target transaction id.
   */
  private async getRawTransaction (transactionId: string): Promise<BitcoinTransactionModel> {
    const request = {
      method: 'getrawtransaction',
      params: [
        transactionId,  // transaction id
        0   // get the raw hex-encoded string
      ]
    };

    const hexEncodedTransaction = await this.rpcCall(request, true);
    const transactionBuffer = Buffer.from(hexEncodedTransaction, 'hex');

    const bitcoreTransaction = BitcoinClient.createBitcoreTransactionFromBuffer(transactionBuffer);

    return BitcoinClient.createBitcoinTransactionModel(bitcoreTransaction);
  }

  // This function is specifically created to help with unit testing.
  private static createBitcoreTransactionFromBuffer (buffer: Buffer): Transaction {
    return new Transaction(buffer);
  }

  private async createBitcoreTransaction (transactionData: string, feeInSatoshis: number): Promise<Transaction> {
    const unspentOutputs = await this.getUnspentOutputs(this.privateKeyAddress);

    const transaction = new Transaction();
    transaction.from(unspentOutputs);
    transaction.addOutput(new Transaction.Output({
      script: Script.buildDataOut(transactionData),
      satoshis: 0
    }));
    transaction.change(this.privateKeyAddress);
    transaction.fee(feeInSatoshis);
    transaction.sign(this.privateKey);

    return transaction;
  }

  private static createBitcoinInputModel (bitcoreInput: Transaction.Input): BitcoinInputModel {
    return {
      previousTransactionId: bitcoreInput.prevTxId.toString('hex'),
      outputIndexInPreviousTransaction: bitcoreInput.outputIndex
    };
  }

  private static createBitcoinOutputModel (bitcoreOutput: Transaction.Output): BitcoinOutputModel {
    return {
      satoshis: bitcoreOutput.satoshis,
      scriptAsmAsString: bitcoreOutput.script.toASM()
    };
  }

  private static createBitcoinTransactionModel (bitcoreTransaction: Transaction): BitcoinTransactionModel {

    const bitcoinInputs = bitcoreTransaction.inputs.map((input) => { return BitcoinClient.createBitcoinInputModel(input); });
    const bitcoinOutputs = bitcoreTransaction.outputs.map((output) => { return BitcoinClient.createBitcoinOutputModel(output); });

    return {
      inputs: bitcoinInputs,
      outputs: bitcoinOutputs,
      id: bitcoreTransaction.id
    };
  }

  private async getUnspentOutputs (address: Address): Promise<Transaction.UnspentOutput[]> {

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
    const response: Array<any> = await this.rpcCall(request, true);

    const unspentTransactions = response.map((coin) => {
      return new Transaction.UnspentOutput(coin);
    });

    console.info(`Returning ${unspentTransactions.length} coins`);

    return unspentTransactions;
  }

  private async rpcCall (request: any, timeout: boolean): Promise<any> {
    // append some standard jrpc parameters
    request['jsonrpc'] = '1.0';
    request['id'] = Math.round(Math.random() * Number.MAX_SAFE_INTEGER).toString(32);

    const requestString = JSON.stringify(request);
    console.debug(`Sending jRPC request: id: ${request.id}, method: ${request['method']}`);

    const requestOptions: RequestInit = {
      body: requestString,
      method: 'post'
    };

    if (this.bitcoinAuthorization) {
      requestOptions.headers = {
        Authorization: `Basic ${this.bitcoinAuthorization}`
      };
    }

    const response = await this.fetchWithRetry(this.bitcoinPeerUri.toString(), requestOptions, timeout);

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
          if (retryCount >= this.requestMaxRetries) {
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

import * as httpStatus from 'http-status';
import BlockData from './models/BlockData';
import IBitcoinClient from './interfaces/IBitcoinClient';
import ReadableStream from '../common/ReadableStream';
import nodeFetch, { FetchError, Response, RequestInit } from 'node-fetch';
import { Address, Transaction } from 'bitcore-lib';

/**
 * Encapsulates functionality for reading/writing to the bitcoin ledger.
 */
export default class BitcoinLedger implements IBitcoinClient {

  /** Bitcoin peer's RPC basic authorization credentials */
  private readonly bitcoinAuthorization?: string;

  constructor (
    private bitcoinPeerUri: string,
    bitcoinRpcUsername: string | undefined,
    bitcoinRpcPassword: string | undefined,
    private requestTimeout: number,
    private requestMaxRetries: number) {

    if (bitcoinRpcUsername && bitcoinRpcPassword) {
      this.bitcoinAuthorization = Buffer.from(`${bitcoinRpcUsername}:${bitcoinRpcPassword}`).toString('base64');
    }
  }

  public async broadcastTransaction (transaction: Transaction): Promise<boolean> {
    const rawTransaction = transaction.serialize();
    console.info(`Broadcasting transaction ${transaction.id}`);
    const request = {
      method: 'sendrawtransaction',
      params: [
        rawTransaction
      ]
    };
    const response = await this.SendGenericRequest(request, true);

    return response.length > 0;
  }

  public async getBlock (hash: string, verbosity: number = 1): Promise<BlockData> {
    const request = {
      method: 'getblock',
      params: [
        hash,
        verbosity
      ]
    };

    const response = await this.SendGenericRequest(request, true);

    return {
      hash: response.hash,
      height: response.height,
      transactions: response.transactions
    };
  }

  public async getBlockHash (height: number): Promise<string> {
    console.info(`Getting hash for block ${height}`);
    const hashRequest = {
      method: 'getblockhash',
      params: [
        height // height of the block
      ]
    };
    return this.SendGenericRequest(hashRequest, true);
  }

  public async getCurrentBlockHeight (): Promise<number> {
    console.info('Getting current block height...');
    const request = {
      method: 'getblockcount'
    };
    const response = await this.SendGenericRequest(request, true);
    return response;
  }

  public async getUnspentCoins (address: Address): Promise<Transaction.UnspentOutput[]> {

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
    const response: Array<any> = await this.SendGenericRequest(request, true);

    const unspentTransactions = response.map((coin) => {
      return new Transaction.UnspentOutput(coin);
    });

    console.info(`Returning ${unspentTransactions.length} coins`);

    return unspentTransactions;
  }

  public async importPublicKey (publicKeyAsHex: string, rescan: boolean): Promise<void> {
    const request = {
      method: 'importpubkey',
      params: [
        publicKeyAsHex,
        'sidetree',
        rescan
      ]
    };

    await this.SendGenericRequest(request, false);
  }

  public async walletExists (address: string): Promise<boolean> {
    console.info(`Checking if bitcoin wallet for ${address} exists`);
    const request = {
      method: 'getaddressinfo',
      params: [
        address
      ]
    };

    const response = await this.SendGenericRequest(request, true);
    return response.labels.length > 0 || response.iswatchonly;
  }

  private async SendGenericRequest (request: any, timeout: boolean): Promise<any> {
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

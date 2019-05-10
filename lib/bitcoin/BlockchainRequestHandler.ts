import { IResponse, ResponseStatus } from '../core/Response';
import nodeFetch, { Response, RequestInit, FetchError } from 'node-fetch';
import * as HttpStatus from 'http-status';
import TransactionNumber from './TransactionNumber';
import { ITransaction } from '../core/Transaction';
import { Script } from 'bitcore-lib';
import ReadableStreamUtils from '../core/util/ReadableStreamUtils';
import { Agent } from 'https';

/**
 * Sidetree Bitcoin request handler class
 */
export default class BlockchainRequestHandler {

  /** The bitcore path prefix for any api call */
  private apiPrefix: string;
  /** HTTPS agent to use when making requests */
  private agent: Agent;
  /** Default GET parameters */
  private readonly BITCORE_GET_PARAMETERS = {
    method: 'get',
    timeout: 1000,
    agent: this.agent
  };

  /**
   * @param bitcoreExtensionUri URI for the bitcore exention
   * @param sidetreeTransactionPrefix prefix used to identify Sidetree transactions in Bitcoin's blockchain
   * @param genesisTransactionNumber the first Sidetree transaction number in Bitcoin's blockchain
   * @param genesisTimeHash the corresponding timehash of genesis transaction number
   * @param bitcoreBlockchain the blockchain to use (BTC, BCH, ETH, etc.)
   * @param bitcoreNetwork the blockchain network to query (mainnet, testnet, etc.)
   */
  public constructor (
    public bitcoreExtensionUri: string,
    public sidetreeTransactionPrefix: string,
    public genesisTransactionNumber: number,
    public genesisTimeHash: string,
    public bitcoreBlockchain: string = 'BTC',
    public bitcoreNetwork: string = 'testnet') {
    this.apiPrefix = `/api/${this.bitcoreBlockchain}/${this.bitcoreNetwork}`;
    this.agent = new Agent({
      keepAlive: true
    });
  }

  /**
   * Calls node Fetch and retries the request on temporal errors
   * @param uri URI to fetch
   * @param requestParameters GET parameters to use
   * @returns Response of the fetch
   */
  private async fetchWithRetry (uri: string, requestParameters?: RequestInit | undefined): Promise<Response> {
    let retryCount = 0;
    let timeout: number;
    do {
      timeout = 1000 + 1000 * 2 ** retryCount;
      const params = Object.assign({}, this.BITCORE_GET_PARAMETERS, requestParameters, {
        timeout
      });
      try {
        return await nodeFetch(uri, params);
      } catch (error) {
        if (error instanceof FetchError) {
          retryCount++;
          switch (error.type) {
            case 'request-timeout':
              console.debug(`request timeout: ${uri}`);
              await this.waitFor(Math.round(Math.random() * 1000 * 2 ** retryCount + 1000));
              console.debug(`retrying request: ${uri}`);
              continue;
          }
        }
        console.error(error);
        throw error;
      }
    } while (true);
  }

  private async waitFor (milliseconds: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    });
  }

  /**
   * Fetches Sidetree transactions (i.e., anchor file hashes) that are newer than the specified transactionNumber.
   * @param sinceTransactionNumber specifies the minimum transactionNumber that the caller knows about
   */
  private async handleFetchRequestHelper (sinceTransactionNumber: number): Promise<IResponse> {
    const defaultResponse = {
      status: ResponseStatus.Succeeded,
      body: {
        'moreTransactions': false,
        'transactions': []
      }
    };

    const prefix = this.sidetreeTransactionPrefix;

    const errorResponse = {
      status: ResponseStatus.ServerError
    };

    // determine the block number that we wish to query
    let blockNumber = TransactionNumber.getBlockNumber(sinceTransactionNumber) + 1;

    // get the height of the tip of the blockchain
    let blockNumberTip = 0;
    const blockResponse = await this.handleLastBlockRequest();
    if (blockResponse.status === ResponseStatus.Succeeded) {
      const blockResponseBody = JSON.parse(JSON.stringify(blockResponse.body));
      blockNumberTip = blockResponseBody['time'];
    } else {
      return errorResponse;
    }

    do {
      // this is the number of blocks we will examine in one REST call
      const blockBudget = 0;
      let blockNumberEnd = blockNumber + blockBudget;
      if (blockNumberEnd > blockNumberTip) {
        blockNumberEnd = blockNumberTip;
      }

      try {
        const transactions = await this.queryTransactionRange(blockNumber, blockNumberEnd, prefix);

        if (transactions.length > 0) {
          return {
            status: ResponseStatus.Succeeded,
            body: {
              'moreTransactions': true,
              'transactions': transactions
            }
          };
        }
      } catch {
        return errorResponse;
      }

      // setup the block number for the next iteration
      blockNumber = blockNumberEnd + 1;
    } while (blockNumber <= blockNumberTip);

    return defaultResponse;
  }

  /**
   *
   * @param blockNumber Beginning block number of the query range
   * @param blockNumberEnd Ending block number (inclusive) of the query range
   * @param prefix Sidetree prefix to filter data by
   * @returns Transactions within the block range
   */
  private async queryTransactionRange (blockNumber: number, blockNumberEnd: number, prefix: string):
    Promise<ITransaction[]> {
    console.debug(`Scanning blocks [${blockNumber}, ${blockNumberEnd}]`);

    const transactionRequests: Promise<ITransaction[]>[] = [];
    for (let blockHeight = blockNumber; blockHeight <= blockNumberEnd; blockHeight++) {
      transactionRequests.push((async (): Promise<ITransaction[]> => {
        const transactions: ITransaction[] = [];
        const uri = `${this.bitcoreExtensionUri}${this.apiPrefix}/tx?blockHeight=${blockHeight}`;

        const content = await this.fetchWithRetry(uri, this.BITCORE_GET_PARAMETERS);

        const responseBodyString = await ReadableStreamUtils.readAll(content.body);
        if (content.status === HttpStatus.OK) {
          // array of objects with "txid"
          const contentBody: Array<any> = JSON.parse(responseBodyString);
          console.debug(`Scanning block ${blockHeight}: ${contentBody.length} transactions found`);
          const anchorRequests: Promise<string[]>[] = [];
          for (let transactionIndex = 0; transactionIndex < contentBody.length; transactionIndex++) {
            const transaction = contentBody[transactionIndex];
            anchorRequests.push(this.queryTransaction(transaction.txid, prefix));
          }
          const anchorHashesReturned = await Promise.all(anchorRequests);
          const anchorHashes = anchorHashesReturned.reduce((anchorHashes: string[], current: string[]): string[] => {
            return anchorHashes.concat(current);
          });
          console.debug(`Scanned block ${blockHeight}: ${anchorHashes.length} sidetree anchor hashes found`);
          if (anchorHashes.length > 0) {
            // get the blockhash from any of the transactions
            const blockHash = contentBody[0].blockHash;
            anchorHashes.forEach((anchorHash, index) => {
              transactions.push({
                transactionTime: blockHeight,
                transactionTimeHash: blockHash,
                anchorFileHash: anchorHash,
                transactionNumber: TransactionNumber.construct(blockHeight, index)
              });
            });
          }
        } else {
          console.error(`Failed to retrieve block ${blockHeight}: ${responseBodyString}`);
          throw new Error(responseBodyString);
        }
        return transactions;
      })());
    }
    const transactions = await Promise.all(transactionRequests);
    return transactions.reduce((transactions: ITransaction[], current: ITransaction[]): ITransaction[] => {
      return transactions.concat(current);
    });
  }

  /**
   * Given a bitcoin transaction Id, queries all output scripts for sidetree transactions using prefix
   * @param transaction Bitcoin Transaction Id
   * @param prefix Sidetree prefix to filter data by
   * @returns Anchor file hashes within the transaction
   */
  private async queryTransaction (transaction: string, prefix: string): Promise<string[]> {
    let hashes: string[] = [];

    const coinUri = `${this.bitcoreExtensionUri}${this.apiPrefix}/tx/${transaction}/coins`;

    const transactionContent = await this.fetchWithRetry(coinUri, this.BITCORE_GET_PARAMETERS);

    const coinsBodyString = await ReadableStreamUtils.readAll(transactionContent.body);
    if (transactionContent.status === HttpStatus.OK) {
      const transactionCoins: any = JSON.parse(coinsBodyString);
      // object with "outputs" array
      const outputs = transactionCoins.outputs as Array<any>;
      for (let outputIndex = 0; outputIndex < outputs.length; outputIndex++) {
        const scriptData = outputs[outputIndex].script as string;
        const script = new Script(scriptData);
        try {
          const data = script.getData().toString();
          if (data.startsWith(prefix)) {
            hashes.push(data.slice(prefix.length));
          }
        } catch (error) {
          // these are script parsing errors, and do not comply with sidetree standards
          // so its safe to ignore
        }
      }
    } else {
      console.error(`Failed to retrieve coins for transaction ${transaction}: ${coinsBodyString}`);
      throw new Error(coinsBodyString);
    }
    return hashes;
  }

  /**
   * Verifies whether the tuple (@param transactionNumber, @param transactionTimeHash) are valid on the blockchain
   */
  public async verifyTransactionTimeHash (transactionNumber: number, transactionTimeHash: string): Promise<IResponse> {
    const errorResponse = {
      status: ResponseStatus.ServerError
    };

    try {
      const blockResponse = await this.handleBlockByHeightRequest(TransactionNumber.getBlockNumber(transactionNumber));
      if (blockResponse.status === ResponseStatus.Succeeded) {
        const blockResponseBody = JSON.parse(JSON.stringify(blockResponse.body));

        let match = true;
        if (blockResponseBody['hash'] !== transactionTimeHash) {
          match = false;
        }

        return {
          status: ResponseStatus.Succeeded,
          body: {
            'match': match
          }
        };
      } else {
        return errorResponse;
      }
    } catch {
      return errorResponse;
    }
  }

  /**
   * Handles the firstValid request
   * @param requestBody Request body containing the list of transactions to be validated
   */
  public async handleFirstValidRequest (requestBody: Buffer): Promise<IResponse> {
    const jsonBody = JSON.parse(requestBody.toString());
    const transactions = jsonBody.transactions;

    // Respond with 'bad request' if no transactions list were provided
    if (!transactions) {
      return {
        status: ResponseStatus.BadRequest
      };
    }

    try {
      const transactionsObj = jsonBody['transactions'];
      for (let i = 0; i < transactionsObj.length; i++) {
        const transaction = transactionsObj[i];
        const transactionNumber = transaction['transactionNumber'];
        const transactionTime = transaction['transactionTime'];
        const transactionTimeHash = transaction['transactionTimeHash'];
        const anchorFileHash = transaction['anchorFileHash'];

        // make a call to verify if the tuple (transactionNumber, transactionTimeHash) are valid
        const verifyResponse = await this.verifyTransactionTimeHash(transactionNumber, transactionTimeHash);

        // check if the request succeeded
        if (verifyResponse.status !== ResponseStatus.Succeeded) {
          // an error occured, so return the default response
          return {
            status: ResponseStatus.ServerError
          };
        }

        const verifyResponseBody = verifyResponse.body;
        // check if there was a match; if so return
        if (Boolean(verifyResponseBody['match']) === true) {
          return {
            status: ResponseStatus.Succeeded,
            body: {
              'transactionNumber': transactionNumber,
              'transactionTime': transactionTime,
              'transactionTimeHash': transactionTimeHash,
              'anchorFileHash': anchorFileHash
            }
          };
        }
      }
      // none of the (transactionNumber, transactionTimeHash) tuples is valid, so return 404 NOT FOUND
      return {
        status: ResponseStatus.NotFound
      };
    } catch {
      return {
        status: ResponseStatus.ServerError
      };
    }
  }

  /**
   * Handles the fetch request
   * @param sinceOptional specifies the minimum Sidetree transaction number that the caller is interested in
   * @param transactionTimeHashOptional specifies the transactionTimeHash corresponding to the since parameter
   */
  public async handleFetchRequest (sinceOptional?: number, transactionTimeHashOptional?: string): Promise<IResponse> {

    const errorResponse = {
      status: ResponseStatus.ServerError,
      body: {}
    };

    let sinceTransactionNumber = this.genesisTransactionNumber;
    let transactionTimeHash = this.genesisTimeHash;

    // determine default values for optional parameters
    if (sinceOptional !== undefined) {
      sinceTransactionNumber = sinceOptional;

      if (transactionTimeHashOptional !== undefined) {
        transactionTimeHash = transactionTimeHashOptional;
      } else {
        // if since was supplied, transactionTimeHash must exist
        return {
          status: ResponseStatus.BadRequest
        };
      }
    }

    // verify the validity of since and transactionTimeHash
    const verifyResponse = await this.verifyTransactionTimeHash(sinceTransactionNumber, transactionTimeHash);
    if (verifyResponse.status === ResponseStatus.Succeeded) {
      const verifyResponseBody = verifyResponse.body;

      // return HTTP 400 if the requested transactionNumber does not match the transactionTimeHash
      if (verifyResponseBody['match'] === false) {
        return {
          status: ResponseStatus.BadRequest,
          body: {
            'code': 'invalid_transaction_number_or_time_hash'
          }
        };
      }
    } else {
      // an error occured, so return the default response
      return errorResponse;
    }

    // produce a list of Sidetree transactions starting from the transactionNumber
    const response = this.handleFetchRequestHelper(sinceTransactionNumber);
    return response;
  }

  /**
   * Handles sidetree transaction anchor request
   * @param requestBody Request body containing the anchor file hash.
   */
  public async handleAnchorRequest (requestBody: Buffer): Promise<IResponse> {
    const jsonBody = JSON.parse(requestBody.toString());
    const anchorFileHash = jsonBody.anchorFileHash;

    // Respond with 'bad request' if no anchor file hash was given.
    if (!anchorFileHash) {
      return {
        status: ResponseStatus.BadRequest
      };
    }

    const prefix = this.sidetreeTransactionPrefix;
    const baseUrl = this.bitcoreExtensionUri;
    const sidetreeTransaction = prefix + anchorFileHash;
    const queryString = '/anchor/';

    const uri = baseUrl + queryString;

    const sidetreeTransactionObject = {
      'transaction': sidetreeTransaction
    };

    const requestParameters = {
      method: 'post',
      body: Buffer.from(JSON.stringify(sidetreeTransactionObject)),
      headers: { 'Content-Type': 'application/json' }
    };

    try {
      const response = await nodeFetch(uri, requestParameters);

      if (response.status === HttpStatus.OK) {
        // Log the anchor file hash and the bitcoin transaction it will be written in.
        const responseBodyString = (response.body.read() as Buffer).toString();
        const resposneBody = JSON.parse(responseBodyString);
        const bitcoinTransactionHash = resposneBody.transactionId;
        console.info(`Anchor file hash '${anchorFileHash}' will be written in bitcoin transaction '${bitcoinTransactionHash}'.`);

        return {
          status: ResponseStatus.Succeeded
        };
      } else {
        return {
          status: response.status,
          body: response.body
        };
      }
    } catch {
      return {
        status: ResponseStatus.ServerError
      };
    }
  }

  /**
   * Helper method that interacts with the back-end service at @param uri to fetch metadata about a block
   */
  private async handleBlockRequestHelper (uri: string): Promise<IResponse> {

    try {
      const content = await nodeFetch(uri, this.BITCORE_GET_PARAMETERS);

      if (content.status === HttpStatus.OK) {
        const responseBodyString = await ReadableStreamUtils.readAll(content.body);
        const contentBody = JSON.parse(responseBodyString);
        return {
          status: ResponseStatus.Succeeded,
          body: {
            'time': contentBody['height'],
            'hash': contentBody['hash']
          }
        };
      } else {
        return {
          status: ResponseStatus.ServerError,
          body: content.body
        };
      }
    } catch {
      return {
        status: ResponseStatus.ServerError
      };
    }
  }

  /**
   * Returns a block associated with the requested hash
   * @param hash Specifies the hash of the block the caller is interested in
   */
  public async handleBlockByHashRequest (hash: string): Promise<IResponse> {
    const baseUrl = this.bitcoreExtensionUri;
    const queryString = `${this.apiPrefix}/block/${hash}`;
    const uri = baseUrl + queryString;
    return this.handleBlockRequestHelper(uri);
  }

  /**
   * Returns a block associated with the requested height
   * @param height Specifies the height of the block the caller is interested in
   */
  public async handleBlockByHeightRequest (height: number): Promise<IResponse> {
    const baseUrl = this.bitcoreExtensionUri;
    const queryString = `${this.apiPrefix}/block/${height}`;
    const uri = baseUrl + queryString;
    return this.handleBlockRequestHelper(uri);
  }

  /**
   * Returns the blockhash of the last block in the blockchain
   */
  public async handleLastBlockRequest (): Promise<IResponse> {
    const baseUrl = this.bitcoreExtensionUri;
    const queryString = `${this.apiPrefix}/block/tip`;
    const uri = baseUrl + queryString;
    return this.handleBlockRequestHelper(uri);
  }
}

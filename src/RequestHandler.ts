import { Response, ResponseStatus } from './Response';
import nodeFetch from 'node-fetch';
import * as HttpStatus from 'http-status';
import TransactionNumber from './TransactionNumber';

/**
 * Sidetree Bitcoin request handler class
 */
export default class RequestHandler {

  /**
   * @param bitcoreSidetreeServiceUri URI for the blockchain service
   * @param sidetreeTransactionPrefix prefix used to identify Sidetree transactions in Bitcoin's blockchain
   * @param genesisTransactionNumber the first Sidetree transaction number in Bitcoin's blockchain
   * @param genesisTimeHash the corresponding timehash of genesis transaction number
   */
  public constructor (public bitcoreSidetreeServiceUri: string,
    public sidetreeTransactionPrefix: string,
    public genesisTransactionNumber: number,
    public genesisTimeHash: string) {

  }

  private buildTransactionsList (hashes: string[],
    blockNumber: number,
    blockHash: string,
    prefix: string,
    sinceTransactionNumber: number) {

    const transactions = [];
    for (let j = 0; j < hashes.length; j++) {
      const transactionNumber = TransactionNumber.construct(blockNumber, j);
      if (transactionNumber > sinceTransactionNumber) {
        transactions.push({
          'transactionNumber': transactionNumber,
          'transactionTime': blockNumber,
          'transactionTimeHash': blockHash,
          'anchorFileHash': hashes[j].slice(prefix.length)
        });
      }
    }

    return transactions;
  }

  /**
   * Fetches transactions that are new than the specified transaction in the specified block.
   * @param blockNumber specifies the blocknumber that will be examined
   * @param isInternalBlock specifies whether the block that will be examined is the current tail of the blockchain
   * @param sinceTransactionNumber specifies the transaction number that the caller already knows
   */
  private async handleFetchBlock (blockNumber: number, isInternalBlock: boolean, sinceTransactionNumber: number): Promise<Response> {
    const prefix = this.sidetreeTransactionPrefix;
    const baseUrl = this.bitcoreSidetreeServiceUri;
    const requestParameters = {
      method: 'get'
    };

    const errorResponse = {
      status: ResponseStatus.ServerError,
      body: {}
    };

    const queryString = '/transactions/' + blockNumber + '/' + prefix;
    const uri = baseUrl + queryString;

    try {
      const content = await nodeFetch(uri, requestParameters);
      if (content.status === HttpStatus.OK) {
        const responseBodyString = (content.body.read() as Buffer).toString();
        const contentBody = JSON.parse(responseBodyString);

        const blockHash = contentBody['blockHash'];
        const hashes = contentBody['hashes'];

        // check if there are Sidetree transactions in the given block
        if (hashes.length > 0) {
          const transactions = this.buildTransactionsList(hashes, blockNumber, blockHash, prefix, sinceTransactionNumber);

          if (transactions.length > 0) {
            return {
              status: ResponseStatus.Succeeded,
              body: {
                'moreTransactions': isInternalBlock,
                'transactions': transactions
              }
            };
          } else {
            // We found Sidetree transactions but their transaction numbers are not larger than sinceTransactionNumber
            return {
              status: ResponseStatus.NotFound,
              body: {}
            };
          }
        } else {
          // we didn't find any Sidetree transactions in the requested block, so return 404 to the caller
          return {
            status: ResponseStatus.NotFound,
            body: {}
          };
        }
      } else {
        return errorResponse;
      }
    } catch {
      return errorResponse;
    }
  }

  private async handleFetchRequestHelper (transactionNumber: number, blockNumberLast: number): Promise<Response> {
    const defaultResponse = {
      status: ResponseStatus.Succeeded,
      body: {
        'moreTransactions': false,
        'transactions': []
      }
    };

    // loop from the block corresponding to the requested block number until the tip of the blockchain
    // return as soon as we find any Sidetree transaction and use "moreTransactions" to ask the caller
    // to call this API for more
    for (let blockNumber = TransactionNumber.getBlockNumber(transactionNumber); blockNumber <= blockNumberLast; blockNumber++) {
      let isInternalBlock = false;

      if (blockNumber < blockNumberLast) {
        isInternalBlock = true;
      }

      const response = await this.handleFetchBlock(blockNumber, isInternalBlock, transactionNumber);

      if (response.status === ResponseStatus.Succeeded) {
        return response;
      } else if (response.status === ResponseStatus.NotFound) {
        continue;
      } else {
        return response;
      }
    }

    // we didn't find any Sidetree transactions, so send the defaultResponse
    return defaultResponse;
  }

  private async verifyTransactionTimeHash (transactionNumber: number, transactionTimeHash: string) {
    const errorResponse = {
      status: ResponseStatus.ServerError,
      body: {}
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
   * Handles the trace request
   * @param transactions an array of (transaction number, transactionTimeHash) tuples to verify the validity
   */

  public async handleTraceRequest (transactions: string): Promise<Response> {
    const transactionsObj = JSON.parse(transactions)['transactions'];

    const response = [];
    for (let i = 0; i < transactionsObj.length; i++) {
      const transaction = transactionsObj[i];
      const transactionNumber = transaction['transactionNumber'];
      const transactionTimeHash = transaction['transactionTimeHash'];
      const verifyResponse = await this.verifyTransactionTimeHash(transactionNumber, transactionTimeHash);

      if (verifyResponse.status === ResponseStatus.Succeeded) {
        const verifyResponseBody = JSON.parse(JSON.stringify(verifyResponse.body));

        response.push({
          'transactionNumber': transactionNumber,
          'transactionTimeHash': transactionTimeHash,
          'validity': verifyResponseBody['match']
        });
      } else {
        // an error occured, so return the default response
        return {
          status: ResponseStatus.ServerError,
          body: {}
        };
      }
    }

    return {
      status: ResponseStatus.Succeeded,
      body: {
        'transactions': response
      }
    };
  }

  /**
   * Handles the fetch request
   * @param sinceOptional specifies the minimum Sidetree transaction number that the caller is interested in
   * @param transactionTimeHashOptional specifies the transactionTimeHash corresponding to the since parameter
   */
  public async handleFetchRequest (sinceOptional?: number, transactionTimeHashOptional?: string): Promise<Response> {

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
          status: ResponseStatus.BadRequest,
          body: {}
        };
      }
    }

    // verify the validity of since and transactionTimeHash
    const verifyResponse = await this.verifyTransactionTimeHash(sinceTransactionNumber, transactionTimeHash);
    if (verifyResponse.status === ResponseStatus.Succeeded) {
      const verifyResponseBody = JSON.parse(JSON.stringify(verifyResponse.body));

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

    // get the height of the tip of the blockchain
    let blockNumberTip = 0;
    const blockResponse = await this.handleLastBlockRequest();
    if (blockResponse.status === ResponseStatus.Succeeded) {
      const blockResponseBody = JSON.parse(JSON.stringify(blockResponse.body));
      blockNumberTip = blockResponseBody['time'];
    } else {
      return errorResponse;
    }

    // produce a list of Sidetree transactions starting from the transactionNumber until blockNumberTip
    const response = this.handleFetchRequestHelper(sinceTransactionNumber, blockNumberTip);
    return response;
  }

  /**
   * Handles sidetree transaction anchor request
   * @param anchorFileHash  Sidetree transaction to write into the underlying blockchain.
   */
  public async handleAnchorRequest (anchorFileHash: string): Promise<Response> {
    const prefix = this.sidetreeTransactionPrefix;
    const baseUrl = this.bitcoreSidetreeServiceUri;
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

    let response: Response;
    try {
      const content = await nodeFetch(uri, requestParameters);

      if (content.status === HttpStatus.OK) {
        response = {
          status: ResponseStatus.Succeeded,
          body: {}
        };
      } else {
        response = {
          status: content.status,
          body: content.body
        };
      }
    } catch {
      response = {
        status: ResponseStatus.ServerError,
        body: {}
      };
    }

    return response;
  }

  private async handleBlockRequestHelper (uri: string): Promise<Response> {
    const requestParameters = {
      method: 'get'
    };

    let response: Response;
    try {
      const content = await nodeFetch(uri, requestParameters);

      if (content.status === HttpStatus.OK) {
        const responseBodyString = (content.body.read() as Buffer).toString();
        const contentBody = JSON.parse(responseBodyString);
        response = {
          status: ResponseStatus.Succeeded,
          body: {
            'time': contentBody['blockNumber'],
            'hash': contentBody['blockHash']
          }
        };
      } else {
        response = {
          status: ResponseStatus.ServerError,
          body: content.body
        };
      }
    } catch {
      response = {
        status: ResponseStatus.ServerError,
        body: {}
      };
    }

    return response;
  }

  /**
   * Returns a block associated with the requested hash
   * @param hash Specifies the hash of the block the caller is interested in
   */
  public async handleBlockByHashRequest (hash: string): Promise<Response> {
    const baseUrl = this.bitcoreSidetreeServiceUri;
    const queryString = '/blocks/' + hash;
    const uri = baseUrl + queryString;
    return this.handleBlockRequestHelper(uri);
  }

  /**
   * Returns a block associated with the requested height
   * @param height Specifies the height of the block the caller is interested in
   */
  public async handleBlockByHeightRequest (height: number): Promise<Response> {
    const baseUrl = this.bitcoreSidetreeServiceUri;
    const queryString = '/blocks/' + height;
    const uri = baseUrl + queryString;
    return this.handleBlockRequestHelper(uri);
  }

  /**
   * Returns the blockhash of the last block in the blockchain
   */
  public async handleLastBlockRequest (): Promise<Response> {
    const baseUrl = this.bitcoreSidetreeServiceUri;
    const queryString = '/blocks/last';
    const uri = baseUrl + queryString;
    return this.handleBlockRequestHelper(uri);
  }
}

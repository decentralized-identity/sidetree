import { Response, ResponseStatus } from './Response';
import * as request from 'request-promise-native';

// import * as bitcore from 'bitcore-lib';

/**
 * Sidetree Bitcoin request handler class
 */
export default class RequestHandler {

  /**
   * Handles the fetch request
   * @param after specifies the minimum Sidetree transaction number that the caller is interested in
   */
  public async handleFetchRequest (after: number): Promise<Response> {
    let response: Response;

    if (after < 0) {
      return {
        status: ResponseStatus.BadRequest,
        body: { error: 'Invalid parameter' }
      };
    }

    try {
      response = {
        status: ResponseStatus.Succeeded,
        body: {
          'moreTransactions': false,
          'transactions': []
        }
      };
    } catch (err) {
      response = {
        status: ResponseStatus.ServerError,
        body: err.message
      };
    }
    return response;
  }

  /**
   * Handles sidetree transaction anchor request
   * @param tx Sidetree transaction to write into the underlying
   */
  public async handleAnchorRequest (tx: string): Promise<Response> {
    const baseUrl = 'http://http://104.40.11.171:3001/SidetreeRooterService';

    // TODO: construct the transaction dynamically; the ts version of bitcore-lib has issues
    const queryString = '/anchor/01000000012dec15faf88ec573e6aef24d534cb252a2c1570fc6525350989a15447ec7' +
      'c92d010000006b483045022100800f8de83c5f7ebfade178b7a013e71f71cc3c972f19c905a3283ba3307ee1cd0220745' +
      'c83820b6016814e8dd3b5ca416b118fd0ba8c66857bdd3d788b3ef85307d80121023eb8129ab5cae93cb940f74dd06897' +
      'df9f20ac6e7ec6ad5ca41e6a35d0415b3fffffffff020000000000000000196a1773696465747265653a68656c6c6f5f7' +
      '76f726c645f7473b829b90a000000001976a914fc7054837bfb4c3a6fbc2d543567bdb0158b0d5188ac00000000';

    let options = {
      uri: baseUrl + queryString
    };

    let response: Response;

    try {
      const result = request.get(options);
      response = {
        status: ResponseStatus.Succeeded,
        body: { txId: result, metadata: tx }
      };
    } catch (err) {
      response = {
        status: ResponseStatus.ServerError,
        body: err.message
      };
    }
    return response;
  }

  /**
   * Returns a block associated with the requested hash
   * @param hash Specifies the hash of the block the caller is interested in
   */
  public async handleBlockByHashRequest (hash: string): Promise<Response> {
    let response: Response;

    try {
      response = {
        status: ResponseStatus.Succeeded,
        body: { 'blockHash': hash }
      };
    } catch (err) {
      response = {
        status: ResponseStatus.ServerError,
        body: err.message
      };
    }
    return response;
  }

  /**
   * Returns the blockhash of the last block in the blockchain
   */
  public async handleLastBlockRequest (): Promise<Response> {
    let response: Response;

    try {
      response = {
        status: ResponseStatus.Succeeded,
        body: {
          'blockNumber': 0,
          'blockHash': '0000000000000000002443210198839565f8d40a6b897beac8669cf7ba629051'
        }
      };
    } catch (err) {
      response = {
        status: ResponseStatus.ServerError,
        body: err.message
      };
    }
    return response;
  }
}

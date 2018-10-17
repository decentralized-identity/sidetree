import * as HttpStatus from 'http-status';
import nodeFetch from 'node-fetch';
import Transaction from './Transaction';

/**
 * Interface to access the underlying blockchain.
 * This interface is mainly useful for creating a mock Blockchain for testing purposes.
 */
export interface Blockchain {
  /**
   * Writes the anchor file hash as a transaction to blockchain.
   */
  write (anchorFileHash: string): Promise<void>;

  /**
   * Gets Sidetree transactions in chronological order.
   * The function call may not return all known transactions, moreTransaction indicates if there are more transactions to be fetched.
   * When afterTransaction is not given, Sidetree transactions starting from inception will be returned.
   * When afterTransaction is given, only Sidetree transaction after the given transaction will be returned.
   * @param afterTransaction A valid Sidetree transaction number.
   */
  read (afterTransaction?: number): Promise<{ moreTransactions: boolean, transactions: Transaction[] }>;
}

/**
 * Class that communicates with the underlying blockchain using REST API defined by the protocol document.
 */
export class BlockchainClient implements Blockchain {

  public constructor (public uri: string) { }

  public async write (anchorFileHash: string): Promise<void> {
    const anchorFileHashObject = {
      anchorFileHash: anchorFileHash
    };

    const requestParameters = {
      method: 'post',
      body: Buffer.from(JSON.stringify(anchorFileHashObject)),
      headers: { 'Content-Type': 'application/json' }
    };
    const response = await nodeFetch(this.uri, requestParameters);

    if (response.status !== HttpStatus.OK) {
      throw new Error('Encountered an error writing anchor file hash to blockchain.');
    }
  }

  public async read (afterTransaction?: number): Promise<{ moreTransactions: boolean, transactions: Transaction[]}> {
    let requestBodyBuffer = {};
    if (afterTransaction) {
      requestBodyBuffer = { afterTransaction: afterTransaction };
    }

    const requestParameters = {
      method: 'get',
      body: Buffer.from(JSON.stringify(requestBodyBuffer)),
      headers: { 'Content-Type': 'application/json' }
    };
    const response = await nodeFetch(this.uri, requestParameters);

    if (response.status !== HttpStatus.OK) {
      throw new Error('Encountered an error fetching Sidetree transactions from blockchain.');
    }

    const responseBodyString = (response.body.read() as Buffer).toString();
    const responseBody = JSON.parse(responseBodyString);

    return responseBody;
  }
}

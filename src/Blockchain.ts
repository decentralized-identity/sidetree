import * as HttpStatus from 'http-status';
import Block from './Block';
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

  /**
   * Gets the last block on the blockchain.
   */
  getLastBlock (): Promise<Block>;
}

/**
 * Class that communicates with the underlying blockchain using REST API defined by the protocol document.
 */
export class BlockchainClient implements Blockchain {
  /** URI that handles transaction operations. */
  private transactionsUri: string; // e.g. https://127.0.0.1/transactions
  private blocksUri: string; // e.g. https://127.0.0.1/blocks

  public constructor (public uri: string) {
    this.transactionsUri = `${uri}/transactions`;
    this.blocksUri = `${uri}/blocks`;
  }

  public async write (anchorFileHash: string): Promise<void> {
    const anchorFileHashObject = {
      anchorFileHash: anchorFileHash
    };

    const requestParameters = {
      method: 'post',
      body: Buffer.from(JSON.stringify(anchorFileHashObject)),
      headers: { 'Content-Type': 'application/json' }
    };
    const response = await nodeFetch(this.transactionsUri, requestParameters);

    if (response.status !== HttpStatus.OK) {
      throw new Error('Encountered an error writing anchor file hash to blockchain.');
    }
  }

  public async read (afterTransaction?: number): Promise<{ moreTransactions: boolean, transactions: Transaction[]}> {
    let afterQueryParameter = '';
    if (afterTransaction) {
      afterQueryParameter = `?after=${afterTransaction}`;
    }

    const readUri = this.transactionsUri + afterQueryParameter; // e.g. https://127.0.0.1/transactions?after=23

    const requestParameters = {
      method: 'get',
      headers: { 'Content-Type': 'application/json' }
    };
    const response = await nodeFetch(readUri, requestParameters);

    if (response.status !== HttpStatus.OK) {
      throw new Error('Encountered an error fetching Sidetree transactions from blockchain.');
    }

    const responseBodyString = (response.body.read() as Buffer).toString();
    const responseBody = JSON.parse(responseBodyString);

    return responseBody;
  }

  // TODO: Consider caching strategy since this will be invoked very frequently, especially by the Rooter.
  public async getLastBlock (): Promise<Block> {
    const uri = `${this.blocksUri}/last`; // e.g. https://127.0.0.1/blocks/last

    const response = await nodeFetch(uri);

    if (response.status !== HttpStatus.OK) {
      throw new Error('Encountered an error fetching last block data from blockchain.');
    }

    const responseBodyString = (response.body.read() as Buffer).toString();
    const responseBody = JSON.parse(responseBodyString);

    return responseBody;
  }
}

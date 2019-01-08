import * as HttpStatus from 'http-status';
import BlockchainTime from './BlockchainTime';
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
   * When sinceTransactionNumber is not given, Sidetree transactions starting from inception will be returned.
   * When sinceTransactionNumber is given, only Sidetree transaction after the given transaction will be returned.
   * @param sinceTransactionNumber A valid Sidetree transaction number.
   * @param transactionTimeHash The hash associated with the anchored time of the transaction number given.
   *                            Required if and only if sinceTransactionNumber is provided.
   */
  read (sinceTransactionNumber?: number, transactionTimeHash?: string): Promise<{ moreTransactions: boolean, transactions: Transaction[] }>;

  /**
   * Gets the latest blockchain time.
   */
  getLatestTime (): Promise<BlockchainTime>;
}

/**
 * Class that communicates with the underlying blockchain using REST API defined by the protocol document.
 */
export class BlockchainClient implements Blockchain {

  /** URI that handles transaction operations. */
  private transactionsUri: string; // e.g. https://127.0.0.1/transactions
  private timeUri: string; // e.g. https://127.0.0.1/time

  public constructor (public uri: string) {
    this.transactionsUri = `${uri}/transactions`;
    this.timeUri = `${uri}/time`;
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

  public async read (sinceTransactionNumber?: number, transactionTimeHash?: string): Promise<{ moreTransactions: boolean, transactions: Transaction[]}> {
    if ((sinceTransactionNumber !== undefined && transactionTimeHash === undefined) ||
        (sinceTransactionNumber === undefined && transactionTimeHash !== undefined)) {
      throw new Error('Transaction number and time hash must both be given or not given at the same time.');
    }

    let queryString = '';
    if (sinceTransactionNumber !== undefined && transactionTimeHash !== undefined) {
      queryString = `?since=${sinceTransactionNumber}&transaction-time-hash=${transactionTimeHash}`;
    }

    const readUri = this.transactionsUri + queryString; // e.g. https://127.0.0.1/transactions?since=6212927891701761&transaction-time-hash=abc

    const requestParameters = {
      method: 'get'
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
  public async getLatestTime (): Promise<BlockchainTime> {
    const response = await nodeFetch(this.timeUri);

    if (response.status !== HttpStatus.OK) {
      throw new Error('Encountered an error fetching latest time from blockchain.');
    }

    const responseBodyString = (response.body.read() as Buffer).toString();
    const responseBody = JSON.parse(responseBodyString);

    return responseBody;
  }
}

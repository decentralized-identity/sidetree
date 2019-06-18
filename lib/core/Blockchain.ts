import * as HttpStatus from 'http-status';
import ErrorCode from '../common/ErrorCode';
import IBlockchainTime from './IBlockchainTime';
import ITransaction from '../common/ITransaction';
import nodeFetch from 'node-fetch';
import ReadableStream from '../common/ReadableStream';
import { SidetreeError } from './Error';

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
   * @throws SidetreeError with ErrorCode.InvalidTransactionNumberOrTimeHash if a potential block reorganization is detected.
   */
  read (sinceTransactionNumber?: number, transactionTimeHash?: string): Promise<{ moreTransactions: boolean, transactions: ITransaction[] }>;

  /**
   * Given a list of Sidetree transaction in any order, iterate through the list and return the first transaction that is valid.
   * @param transactions List of potentially valid transactions.
   */
  getFirstValidTransaction (transactions: ITransaction[]): Promise<ITransaction | undefined>;

  /**
   * Gets the approximate latest time synchronously without requiring to make network call.
   * Useful for cases where high performance is desired and hgih accuracy is not required.
   */
  approximateTime: IBlockchainTime;
}

/**
 * Class that communicates with the underlying blockchain using REST API defined by the protocol document.
 */
export class BlockchainClient implements Blockchain {

  /** Interval for refreshing the cached blockchain time. */
  static readonly cachedBlockchainTimeRefreshInSeconds = 60;
  /** Used for caching the blockchain time to avoid excessive time fetching over network. */
  private cachedBlockchainTime: IBlockchainTime;

  private fetch = nodeFetch;

  /** URI that handles transaction operations. */
  private transactionsUri: string; // e.g. https://127.0.0.1/transactions
  private timeUri: string; // e.g. https://127.0.0.1/time

  public constructor (public uri: string) {
    this.transactionsUri = `${uri}/transactions`;
    this.timeUri = `${uri}/time`;

    this.cachedBlockchainTime = { hash: '', time: 0 }; // Dummy values that gets overwritten by `initialize()`.
  }

  /**
   * Initializes the blockchain client by initializing the cached blockchain time.
   */
  public async initialize () {
    await this.getLatestTime();
  }

  /**
   * The function that starts periodically anchoring operation batches to blockchain.
   */
  public startPeriodicCachedBlockchainTimeRefresh () {
    setInterval(async () => this.getLatestTime(), BlockchainClient.cachedBlockchainTimeRefreshInSeconds * 1000);
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
    const response = await this.fetch(this.transactionsUri, requestParameters);

    if (response.status !== HttpStatus.OK) {
      console.error(`Blockchain write error response status: ${response.status}`);
      console.error(`Blockchain write error body: ${response.body.read()}`);
      throw new Error('Encountered an error writing anchor file hash to blockchain.');
    }
  }

  public async read (sinceTransactionNumber?: number, transactionTimeHash?: string): Promise<{ moreTransactions: boolean, transactions: ITransaction[]}> {
    if ((sinceTransactionNumber !== undefined && transactionTimeHash === undefined) ||
        (sinceTransactionNumber === undefined && transactionTimeHash !== undefined)) {
      throw new Error('Transaction number and time hash must both be given or not given at the same time.');
    }

    let queryString = '';
    if (sinceTransactionNumber !== undefined && transactionTimeHash !== undefined) {
      queryString = `?since=${sinceTransactionNumber}&transaction-time-hash=${transactionTimeHash}`;
    }

    const readUri = this.transactionsUri + queryString; // e.g. https://127.0.0.1/transactions?since=6212927891701761&transaction-time-hash=abc

    console.info(`Fetching URI '${readUri}'...`);
    const response = await this.fetch(readUri);
    console.info(`Fetch response: ${response.status}'.`);

    const responseBodyString = await ReadableStream.readAll(response.body);
    const responseBody = JSON.parse(responseBodyString);

    if (response.status === HttpStatus.BAD_REQUEST &&
        responseBody.code === ErrorCode.InvalidTransactionNumberOrTimeHash) {
      throw new SidetreeError(ErrorCode.InvalidTransactionNumberOrTimeHash);
    }

    if (response.status !== HttpStatus.OK) {
      console.error(`Blockchain read error response status: ${response.status}`);
      console.error(`Blockchain read error body: ${response.body.read()}`);
      throw new Error('Encountered an error fetching Sidetree transactions from blockchain.');
    }

    return responseBody;
  }

  public async getFirstValidTransaction (transactions: ITransaction[]): Promise<ITransaction | undefined> {
    const bodyString = JSON.stringify({ transactions });
    const requestParameters = {
      method: 'post',
      body: Buffer.from(bodyString),
      headers: { 'Content-Type': 'application/json' }
    };

    const firstValidTransactionUri = `${this.transactionsUri}/firstValid`;

    console.info(`Posting to first-valid transaction URI '${firstValidTransactionUri} with body: '${bodyString}'...`);

    const response = await this.fetch(firstValidTransactionUri, requestParameters);

    if (response.status === HttpStatus.NOT_FOUND) {
      return undefined;
    }

    const responseBodyString = (response.body.read() as Buffer).toString();
    const transaction = JSON.parse(responseBodyString);

    return transaction;
  }

  public get approximateTime (): IBlockchainTime {
    return this.cachedBlockchainTime;
  }

  /**
   * Gets the latest blockchain time and updates the cached time.
   */
  private async getLatestTime (): Promise<IBlockchainTime> {
    try {
      console.info(`Refreshing cached blockchain time...`);
      const response = await this.fetch(this.timeUri);
      const responseBodyString = (response.body.read() as Buffer).toString();

      if (response.status !== HttpStatus.OK) {
        const errorMessage = `Encountered an error fetching latest time from blockchain: ${responseBodyString}`;
        throw new Error(errorMessage);
      }

      const responseBody = JSON.parse(responseBodyString);

      // Update the cached blockchain time everytime blockchain time is fetched over the network,
      this.cachedBlockchainTime = responseBody;

      console.info(`Refreshed blockchain time: ${responseBodyString}`);
      return responseBody;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }
}

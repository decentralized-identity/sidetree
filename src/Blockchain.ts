import * as HttpStatus from 'http-status';
import BlockchainTime from './BlockchainTime';
import Logger from './lib/Logger';
import nodeFetch from 'node-fetch';
import Transaction from './Transaction';
import { ErrorCode, SidetreeError } from './Error';

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
  read (sinceTransactionNumber?: number, transactionTimeHash?: string): Promise<{ moreTransactions: boolean, transactions: Transaction[] }>;

  /**
   * Given a list of Sidetree transaction in any order, iterate through the list and return the first transaction that is valid.
   * @param transactions List of potentially valid transactions.
   */
  getFirstValidTransaction (transactions: Transaction[]): Promise<Transaction | undefined>;

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

    Logger.info(`Fetching URI '${readUri}'...`);
    const response = await nodeFetch(readUri);
    Logger.info(`Fetch URI '${readUri}' response: ${response.status}'.`);

    const responseBodyString = (response.body.read() as Buffer).toString();
    const responseBody = JSON.parse(responseBodyString);

    if (response.status === HttpStatus.BAD_REQUEST &&
        responseBody.code === 'invalid_transaction_number_or_time_hash') {
      throw new SidetreeError(ErrorCode.InvalidTransactionNumberOrTimeHash);
    }

    if (response.status !== HttpStatus.OK) {
      throw new Error('Encountered an error fetching Sidetree transactions from blockchain.');
    }

    return responseBody;
  }

  public async getFirstValidTransaction (transactions: Transaction[]): Promise<Transaction | undefined> {
    const requestParameters = {
      method: 'post',
      body: Buffer.from(JSON.stringify(transactions)),
      headers: { 'Content-Type': 'application/json' }
    };

    const firstValidTransactionUri = `${this.transactionsUri}/firstValid`;
    const response = await nodeFetch(firstValidTransactionUri, requestParameters);

    if (response.status === HttpStatus.NOT_FOUND) {
      return undefined;
    }

    const responseBodyString = (response.body.read() as Buffer).toString();
    const transaction = JSON.parse(responseBodyString);

    return transaction;
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

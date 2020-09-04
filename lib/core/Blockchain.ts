import * as HttpStatus from 'http-status';
import BlockchainTimeModel from './models/BlockchainTimeModel';
import CoreErrorCode from './ErrorCode';
import IBlockchain from './interfaces/IBlockchain';
import JsonAsync from './versions/latest/util/JsonAsync';
import nodeFetch from 'node-fetch';
import ReadableStream from '../common/ReadableStream';
import ServiceVersionFetcher from './ServiceVersionFetcher';
import ServiceVersionModel from '../common/models/ServiceVersionModel';
import SharedErrorCode from '../common/SharedErrorCode';
import SidetreeError from '../common/SidetreeError';
import TransactionModel from '../common/models/TransactionModel';
import ValueTimeLockModel from '../common/models/ValueTimeLockModel';

/**
 * Class that communicates with the underlying blockchain using REST API defined by the protocol document.
 */
export default class Blockchain implements IBlockchain {

  /** Interval for refreshing the cached blockchain time. */
  static readonly cachedBlockchainTimeRefreshInSeconds = 60;
  /** Used for caching the blockchain time to avoid excessive time fetching over network. */
  private cachedBlockchainTime: BlockchainTimeModel;

  private serviceVersionFetcher: ServiceVersionFetcher;
  private fetch = nodeFetch;

  /** URI that handles transaction operations. */
  private transactionsUri: string; // e.g. https://127.0.0.1/transactions
  private timeUri: string; // e.g. https://127.0.0.1/time
  private feeUri: string; // e.g. https://127.0.0.1/fee
  private locksUri: string; // e.g. https://127.0.0.1/locks
  private writerLockUri: string; // e.g. https://127.0.0.1/writelock

  public constructor (public uri: string) {
    this.transactionsUri = `${uri}/transactions`;
    this.timeUri = `${uri}/time`;
    this.feeUri = `${uri}/fee`;
    this.locksUri = `${uri}/locks`;
    this.writerLockUri = `${uri}/writerlock`;

    this.serviceVersionFetcher = new ServiceVersionFetcher(uri);

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
    setInterval(async () => this.getLatestTime(), Blockchain.cachedBlockchainTimeRefreshInSeconds * 1000);
  }

  public async write (anchorString: string, minimumFee: number): Promise<void> {
    const anchorStringObject = {
      minimumFee,
      anchorString
    };

    const requestParameters = {
      method: 'post',
      body: Buffer.from(JSON.stringify(anchorStringObject)),
      headers: { 'Content-Type': 'application/json' }
    };
    const response = await this.fetch(this.transactionsUri, requestParameters);

    if (response.status !== HttpStatus.OK) {
      console.error(`Blockchain write error response status: ${response.status}`);
      console.error(`Blockchain write error body: ${response.body.read()}`);
      throw new SidetreeError(CoreErrorCode.BlockchainWriteResponseNotOk);
    }
  }

  public async read (sinceTransactionNumber?: number, transactionTimeHash?: string): Promise<{ moreTransactions: boolean, transactions: TransactionModel[]}> {
    if ((sinceTransactionNumber !== undefined && transactionTimeHash === undefined) ||
        (sinceTransactionNumber === undefined && transactionTimeHash !== undefined)) {
      throw new SidetreeError(
        CoreErrorCode.BlockchainReadInvalidArguments,
        'Transaction number and time hash must both be given or not given at the same time.'
      );
    }

    let queryString = '';
    if (sinceTransactionNumber !== undefined && transactionTimeHash !== undefined) {
      queryString = `?since=${sinceTransactionNumber}&transaction-time-hash=${transactionTimeHash}`;
    }

    const readUri = this.transactionsUri + queryString; // e.g. https://127.0.0.1/transactions?since=6212927891701761&transaction-time-hash=abc

    console.info(`Fetching URI '${readUri}'...`);
    const response = await this.fetch(readUri);
    console.info(`Fetch response: ${response.status}'.`);

    const responseBodyBuffer = await ReadableStream.readAll(response.body);
    const responseBody = JSON.parse(responseBodyBuffer.toString());

    if (response.status === HttpStatus.BAD_REQUEST &&
        responseBody.code === SharedErrorCode.InvalidTransactionNumberOrTimeHash) {
      throw new SidetreeError(SharedErrorCode.InvalidTransactionNumberOrTimeHash);
    }

    if (response.status !== HttpStatus.OK) {
      console.error(`Blockchain read error response status: ${response.status}`);
      console.error(`Blockchain read error body: ${responseBody}`);
      throw new SidetreeError(CoreErrorCode.BlockchainReadResponseNotOk);
    }

    return responseBody;
  }

  public async getFirstValidTransaction (transactions: TransactionModel[]): Promise<TransactionModel | undefined> {
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

  public get approximateTime (): BlockchainTimeModel {
    return this.cachedBlockchainTime;
  }

  /**
   * Gets the version of the bitcoin service.
   */
  public async getServiceVersion (): Promise<ServiceVersionModel> {
    return this.serviceVersionFetcher.getVersion();
  }

  /**
   * Gets the latest blockchain time and updates the cached time.
   */
  public async getLatestTime (): Promise<BlockchainTimeModel> {
    console.info(`Refreshing cached blockchain time...`);
    const response = await this.fetch(this.timeUri);
    const responseBodyString = (response.body.read() as Buffer).toString();

    if (response.status !== HttpStatus.OK) {
      const errorMessage = `Encountered an error fetching latest time from blockchain: ${responseBodyString}`;
      throw new SidetreeError(CoreErrorCode.BlockchainGetLatestTimeResponseNotOk, errorMessage);
    }

    const responseBody = JSON.parse(responseBodyString);

    // Update the cached blockchain time every time blockchain time is fetched over the network,
    this.cachedBlockchainTime = responseBody;

    console.info(`Refreshed blockchain time: ${responseBodyString}`);
    return responseBody;
  }

  public async getFee (transactionTime: number): Promise<number> {

    const readUri = `${this.feeUri}/${transactionTime}`;

    const response = await this.fetch(readUri);
    const responseBodyString = await ReadableStream.readAll(response.body);
    const responseBody = JSON.parse(responseBodyString.toString());

    if (response.status === HttpStatus.BAD_REQUEST &&
        responseBody.code === SharedErrorCode.BlockchainTimeOutOfRange) {
      throw new SidetreeError(SharedErrorCode.BlockchainTimeOutOfRange);
    }

    if (response.status !== HttpStatus.OK) {
      console.error(`Blockchain read error response status: ${response.status}`);
      console.error(`Blockchain read error body: ${responseBodyString}`);
      throw new SidetreeError(CoreErrorCode.BlockchainGetFeeResponseNotOk);
    }

    return responseBody.normalizedTransactionFee as number;
  }

  public async getValueTimeLock (lockIdentifier: string): Promise<ValueTimeLockModel | undefined> {
    const readUri = `${this.locksUri}/${lockIdentifier}`;

    const response = await this.fetch(readUri);
    const responseBodyString = await ReadableStream.readAll(response.body);

    if (response.status === HttpStatus.NOT_FOUND) {
      return undefined;
    }

    if (response.status !== HttpStatus.OK) {
      throw new SidetreeError(CoreErrorCode.BlockchainGetLockResponseNotOk, `Response: ${responseBodyString}`);
    }

    return JsonAsync.parse(responseBodyString);
  }

  public async getWriterValueTimeLock (): Promise<ValueTimeLockModel | undefined> {

    const response = await this.fetch(this.writerLockUri);
    const responseBodyString = await ReadableStream.readAll(response.body);
    const responseBody = await JsonAsync.parse(responseBodyString);

    if (response.status === HttpStatus.NOT_FOUND) {
      return undefined;
    }

    if (response.status !== HttpStatus.OK) {
      throw new SidetreeError(CoreErrorCode.BlockchainGetWriterLockResponseNotOk, `Response: ${responseBodyString}`);
    }

    return responseBody;
  }
}

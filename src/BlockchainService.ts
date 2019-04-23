import { InMemoryTransactionStore } from './TransactionStore';
import Transaction from './Transaction';
import RequestHandler from './RequestHandler';
import { Response, ResponseStatus } from './Response';

/**
 * The class that is instantiated when running a Sidetree blockchain service.
 */
export default class BlockchainService {

  /**
   * request handler for non-fetch related APIs.
   */
  public requestHandler: RequestHandler;

  /**
   * Data store that stores the state of transactions.
   */
  private transactionStore = new InMemoryTransactionStore();

  /**
   * Tracks the last known Sidetree transaction
   */
  private lastKnownTransaction: Transaction | undefined;

  /**
   * Denotes if the periodic transaction processing should continue to occur.
   * Used mainly for test purposes.
   */
  private continuePeriodicProcessing = false;

  /**
   * @param bitcoreSidetreeServiceUri URI for the blockchain service
   * @param sidetreeTransactionPrefix prefix used to identify Sidetree transactions in Bitcoin's blockchain
   * @param genesisTransactionNumber the first Sidetree transaction number in Bitcoin's blockchain
   * @param genesisTimeHash the corresponding timehash of genesis transaction number
   * @param pollingIntervalInSeconds time interval for the background task on polling Bitcoin blockchain
   */
  public constructor (public bitcoreSidetreeServiceUri: string,
    public sidetreeTransactionPrefix: string,
    public genesisTransactionNumber: number,
    public genesisTimeHash: string,
    private pollingIntervalInSeconds: number,
    private maxSidetreeTransactions: number) {
    this.requestHandler = new RequestHandler(bitcoreSidetreeServiceUri, sidetreeTransactionPrefix, genesisTransactionNumber, genesisTimeHash);
  }

  /**
   * The initialization method that must be called before consumption of this object.
   * The method starts a background thread to fetch Sidetree transactions from the blockchain layer.
   */
  public async initialize () {
    await this.startPeriodicProcessing();
  }

  /**
   * The function that starts the periodic polling of Sidetree operations.
   */
  public async startPeriodicProcessing () {
    // Initialize the last known transaction before starting processing.
    this.lastKnownTransaction = await this.transactionStore.getLastTransaction();

    console.info(`Starting periodic transactions polling.`);
    setImmediate(async () => {
      this.continuePeriodicProcessing = true;

      // tslint:disable-next-line:no-floating-promises - this.processTransactions() never throws.
      this.processTransactions();
    });
  }

  /**
   * Stops periodic transaction processing.
   * Mainly used for test purposes.
   */
  public stopPeriodicProcessing () {
    console.info(`Stopped periodic transactions processing.`);
    this.continuePeriodicProcessing = false;
  }

  /**
   * Processes new transactions if any, and then scehdules the next round of processing
   */
  public async processTransactions () {

    try {
      // Keep fetching new Sidetree transactions from blockchain
      // until there are no more new transactions or there is a block reorganization.
      let moreTransactions = false;
      do {
        let blockReorganizationDetected = false;
        // Get the last transaction to be used as a timestamp to fetch new transactions.
        const lastKnownTransactionNumber = this.lastKnownTransaction ? this.lastKnownTransaction.transactionNumber : undefined;
        const lastKnownTransactionTimeHash = this.lastKnownTransaction ? this.lastKnownTransaction.transactionTimeHash : undefined;

        let readResult;
        try {
          console.info('Fetching Sidetree transactions from bitcored service...');
          readResult = await this.requestHandler.handleFetchRequest(lastKnownTransactionNumber, lastKnownTransactionTimeHash);

          // check if the request succeeded; if yes, process transactions
          if (readResult.status === ResponseStatus.Succeeded) {
            const readResultBody = readResult.body as any;
            const transactions = readResultBody['transactions'];
            moreTransactions = readResultBody['moreTransactions'];
            if (transactions.length > 0) {
              console.info(`Fetched ${transactions.length} Sidetree transactions from bitcored service ${transactions[0].transactionNumber}`);
              for (const transaction of transactions) {
                await this.transactionStore.addTransaction(transaction);
              }
              this.lastKnownTransaction = await this.transactionStore.getLastTransaction();
            }
          } else if (readResult.status === ResponseStatus.BadRequest) {
            const readResultBody = readResult.body as any;
            const code = readResultBody['code'];
            if (code === 'invalid_transaction_number_or_time_hash') {
              console.info(`Detected blockchain reorganization`);
              blockReorganizationDetected = true;
            }
          }
        } catch (error) {
          throw error;
        }

        // If block reorg is detected, revert invalid transactions
        if (blockReorganizationDetected) {
          console.info(`Reverting invalid transactions...`);
          await this.RevertInvalidTransactions();
          console.info(`Completed reverting invalid transactions.`);
        }
      } while (moreTransactions);
    } catch (error) {
      console.error(`Encountered unhandled and possibly fatal error, must investigate and fix:`);
      console.error(error);
    } finally {
      if (this.continuePeriodicProcessing) {
        console.info(`Waiting for ${this.pollingIntervalInSeconds} seconds before fetching and processing transactions again.`);
        setTimeout(async () => this.processTransactions(), this.pollingIntervalInSeconds * 1000);
      }
    }
  }

  /**
   * Reverts invalid transactions. Used in the event of a blockchain reorganization.
   */
  private async RevertInvalidTransactions () {
    // Compute a list of exponentially-spaced transactions with their index, starting from the last known transaction
    const exponentiallySpacedTransactions = await this.transactionStore.getExponentiallySpacedTransactions();

    let transactionList = [];
    for (let i = 0; i < exponentiallySpacedTransactions.length; i++) {
      const transaction = exponentiallySpacedTransactions[i];
      transactionList.push({
        'transactionNumber': transaction.transactionNumber,
        'transactionTime': transaction.transactionTime,
        'transactionTimeHash': transaction.transactionTimeHash,
        'anchorFileHash': transaction.anchorFileHash
      });
    }

    const firstValidRequest = {
      'transactions': transactionList
    };

    // Find a known valid Sidetree transaction that is prior to the block reorganization.
    const bestKnownValidRecentTransaction
      = await this.requestHandler.handleFirstValidRequest(Buffer.from(JSON.stringify(firstValidRequest)));

    if (bestKnownValidRecentTransaction.status === ResponseStatus.Succeeded) {
      const bestKnownValidRecentTransactionBody = bestKnownValidRecentTransaction.body as any;
      const bestKnownValidRecentTransactionNumber = bestKnownValidRecentTransactionBody['transactionNumber'];
      console.info(`Best known valid recent transaction: ${bestKnownValidRecentTransactionNumber}`);
      await this.transactionStore.removeTransactionsLaterThan(bestKnownValidRecentTransactionNumber);

      // Reset the in-memory last known good Tranaction so we next processing cycle will fetch from the correct timestamp
      this.lastKnownTransaction = bestKnownValidRecentTransactionBody;
    }
  }

  /**
   * Verifies whether the tuple (@param transactionNumber, @param transactionTimeHash) are valid on the cache's view of the blockchain
   */
  public async verifyTransactionTimeHashCached (transactionNumber: number, transactionTimeHash: string): Promise<Response> {
    const errorResponse = {
      status: ResponseStatus.ServerError
    };

    try {
      const cacheIndex = await this.transactionStore.locateTransactionIndex(transactionNumber);
      let match = true;

      // if we can't locate the requested transaction, return false;
      if (cacheIndex === undefined) {
        match = false;
      } else {
        const cachedTransaction = await this.transactionStore.getTransaction(cacheIndex);

        // if we can't locate the transaction in the cache at the index, return false
        if (cachedTransaction === undefined) {
          match = false;
        } else {

          // if cached transaction doesn't match the caller's parameters, return false
          if (cachedTransaction.transactionNumber !== transactionNumber || cachedTransaction.transactionTimeHash !== transactionTimeHash) {
            match = false;
          } else {
            match = true;
          }
        }
      }

      return {
        status: ResponseStatus.Succeeded,
        body: {
          'match': match
        }
      };
    } catch {
      return errorResponse;
    }
  }

  /**
   * Handles the fetch request from cache
   * @param sinceTransactionNumber specifies the minimum Sidetree transaction number that the caller is interested in
   * @param transactionTimeHash specifies the transactionTimeHash corresponding to the since parameter
   */
  public async handleFetchRequestCached (sinceTransactionNumber?: number, transactionTimeHash?: string): Promise<Response> {

    const errorResponse = {
      status: ResponseStatus.ServerError,
      body: {}
    };

    // `sinceTransactionNumber` and `transactionTimeHash` must be both be undefined or defined at the same time.
    if ((sinceTransactionNumber === undefined && transactionTimeHash !== undefined) ||
        (sinceTransactionNumber !== undefined && transactionTimeHash === undefined)) {
      return {
        status: ResponseStatus.BadRequest
      };
    }

    const reorgResponse = {
      status: ResponseStatus.BadRequest,
      body: {
        'code': 'invalid_transaction_number_or_time_hash'
      }
    };

    // If 'since' transaction number and time is given, then need to validate them.
    if (sinceTransactionNumber !== undefined) {
      // verify the validity of since and transactionTimeHash
      const verifyResponse = await this.verifyTransactionTimeHashCached(sinceTransactionNumber, transactionTimeHash!);
      if (verifyResponse.status === ResponseStatus.Succeeded) {
        const verifyResponseBody = verifyResponse.body as any;

        // return HTTP 400 if the requested transactionNumber does not match the transactionTimeHash
        if (verifyResponseBody['match'] === false) {
          return reorgResponse;
        }
      } else {
        // an error occured, so return the default response
        return errorResponse;
      }
    }

    const response = await this.transactionStore.getTransactionsLaterThan(this.maxSidetreeTransactions, sinceTransactionNumber);
    if (response.status === ResponseStatus.Succeeded) {
      const responseBody = response.body as any;
      let moreTransactions;

      if (this.lastKnownTransaction === undefined) {
        moreTransactions = false;
      } else {
        if (responseBody.transactions.length > 0 &&
          responseBody.transactions[responseBody.transactions.length - 1].transactionNumber < this.lastKnownTransaction.transactionNumber) {
          moreTransactions = true;
        } else {
          moreTransactions = false;
        }
      }

      return {
        status: ResponseStatus.Succeeded,
        body: {
          'moreTransactions': moreTransactions,
          'transactions': responseBody.transactions
        }
      };

    } else if (response.status === ResponseStatus.BadRequest) {
      return reorgResponse;
    } else {
      // an error occured, so return the default response
      return errorResponse;
    }
  }

  /**
   * Handles the firstValid request using the cache
   * @param requestBody Request body containing the list of transactions to be validated
   */
  public async handleFirstValidRequestCached (requestBody: Buffer): Promise<Response> {
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
        const verifyResponse = await this.verifyTransactionTimeHashCached(transactionNumber, transactionTimeHash);

        // check if the request succeeded
        if (verifyResponse.status !== ResponseStatus.Succeeded) {
          // an error occured, so return the default response
          return {
            status: ResponseStatus.ServerError
          };
        }

        const verifyResponseBody = verifyResponse.body as any;
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
   * Returns the number of transactions in the cache
   */
  public async getTransactionsCount (): Promise<number> {
    return this.transactionStore.getTransactionsCount();
  }
}

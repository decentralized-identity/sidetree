import * as retry from 'async-retry';
import * as fetchMock from 'fetch-mock';
import Observer from '../src/Observer';
import { BlockchainClient } from '../src/Blockchain';
import { CasClient } from '../src/Cas';
import { Config, ConfigKey } from '../src/Config';
import { createOperationProcessor } from '../src/OperationProcessor';
import { Response } from 'node-fetch';
import { Readable } from 'readable-stream';

describe('Observer', async () => {
  const configFile = require('../json/config.json');
  const config = new Config(configFile);
  const cas = new CasClient(config[ConfigKey.CasNodeUri]);
  const operationProcessor = createOperationProcessor(cas, config);

  fetchMock.config.sendAsJson = false;

  const originalDefaultTestTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;

  beforeAll(() => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000; // These asynchronous tests can take a bit longer than normal.
  });

  afterAll(() => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = originalDefaultTestTimeout;
  });

  afterEach(() => {
    fetchMock.sandbox().reset();
    fetchMock.reset();
  });

  it('should cache transactions processed.', async () => {
    // Prepare the mock response from blockchain service.
    const initialTransactionFetchResponseBody = {
      'moreTransactions': false,
      'transactions': [
        {
          'transactionNumber': 1,
          'transactionTime': 1000,
          'transactionTimeHash': '1000',
          'anchorFileHash': '1stTransaction'
        },
        {
          'transactionNumber': 2,
          'transactionTime': 1000,
          'transactionTimeHash': '1000',
          'anchorFileHash': '2ndTransaction'
        }
      ]
    };
    const subsequentTransactionFetchResponseBody = {
      'moreTransactions': false,
      'transactions': []
    };
    const mockNodeFetch = fetchMock.sandbox().getOnce('*', createReadableStreamResponse(initialTransactionFetchResponseBody))
                                             .get('http://127.0.0.1:3009/transactions?since=2&transaction-time-hash=1000',
                                               createReadableStreamResponse(subsequentTransactionFetchResponseBody));
    const blockchainClient = new BlockchainClient(config[ConfigKey.BlockchainNodeUri], mockNodeFetch);

    // Start the Observer.
    const observer = new Observer(blockchainClient, cas, operationProcessor, 1);
    const processedTransactions = observer.getProcessedTransactions();
    observer.startPeriodicProcessing(); // Asynchronously triggers Observer to start processing transactions immediately.

    // Monitor the processed transactions list until change is detected or max retries is reached.
    await retry(async _bail => {
      const processedTransactionCount = observer.getProcessedTransactions().length;
      if (processedTransactionCount === 2) {
        return;
      }

      // NOTE: if anything throws, we retry.
      throw new Error('No change to the processed transactions list.');
    }, {
      retries: 10,
      minTimeout: 500, // milliseconds
      maxTimeout: 500 // milliseconds
    });

    observer.stopPeriodicProcessing(); // Asynchronously stops Observer from processing more transactions after the initial processing cycle.

    expect(processedTransactions[0].anchorFileHash).toEqual('1stTransaction');
    expect(processedTransactions[1].anchorFileHash).toEqual('2ndTransaction');
  });

  it('should detect and handle block reorganization correctly.', async () => {
    // Prepare the mock response from blockchain service.
    const initialTransactionFetchResponseBody = {
      'moreTransactions': false,
      'transactions': [
        {
          'transactionNumber': 1,
          'transactionTime': 1000,
          'transactionTimeHash': '1000',
          'anchorFileHash': '1stTransaction'
        },
        {
          'transactionNumber': 2,
          'transactionTime': 2000,
          'transactionTimeHash': '2000',
          'anchorFileHash': '2ndTransaction'
        },
        {
          'transactionNumber': 3,
          'transactionTime': 3000,
          'transactionTimeHash': '3000',
          'anchorFileHash': '3rdTransaction'
        }
      ]
    };

    const transactionFetchResponseBodyAfterBlockReorg = {
      'moreTransactions': false,
      'transactions': [
        {
          'transactionNumber': 2,
          'transactionTime': 2001,
          'transactionTimeHash': '2001',
          'anchorFileHash': '2ndTransactionNew'
        },
        {
          'transactionNumber': 3,
          'transactionTime': 3001,
          'transactionTimeHash': '3000',
          'anchorFileHash': '3rdTransactionNew'
        },
        {
          'transactionNumber': 4,
          'transactionTime': 4000,
          'transactionTimeHash': '4000',
          'anchorFileHash': '4thTransaction'
        }
      ]
    };
    const mockNodeFetch = fetchMock.sandbox().getOnce('*', createReadableStreamResponse(initialTransactionFetchResponseBody))
                                             .getOnce('http://127.0.0.1:3009/transactions?since=3&transaction-time-hash=3000',
                                               createReadableStreamResponse({ code: 'invalid_transaction_number_or_time_hash' }, 400))
                                             .postOnce('*', createReadableStreamResponse(initialTransactionFetchResponseBody.transactions[0]))
                                             .getOnce('http://127.0.0.1:3009/transactions?since=1&transaction-time-hash=1000',
                                               createReadableStreamResponse(transactionFetchResponseBodyAfterBlockReorg));
    const blockchainClient = new BlockchainClient(config[ConfigKey.BlockchainNodeUri], mockNodeFetch);

    // Process first set of transactions.
    const observer = new Observer(blockchainClient, cas, operationProcessor, 1);

    await observer.processTransactions(); // Fetching initial set of transactions.
    await observer.processTransactions(); // Fetching more transactions which triggers the detection and handling of block reorganization.

    // NOTE: the above processTransactions will trigger the 2nd GET call followed by subsequent POST CALL and final GET call.

    // Monitor the processed transactions list until the expected count or max retries is reached.
    const processedTransactions = observer.getProcessedTransactions();
    await retry(async _bail => {
      const processedTransactionCount = processedTransactions.length;
      if (processedTransactionCount === 4) {
        return;
      }

      // NOTE: if anything throws, we retry.
      throw new Error('Block reorganization not handled yet.');
    }, {
      retries: 10,
      minTimeout: 500, // milliseconds
      maxTimeout: 500 // milliseconds
    });

    expect(processedTransactions[1].anchorFileHash).toEqual('2ndTransactionNew');
    expect(processedTransactions[2].anchorFileHash).toEqual('3rdTransactionNew');
    expect(processedTransactions[3].anchorFileHash).toEqual('4thTransaction');
  });
});

/**
 * Creates a Response with the given object as readable stream body.
 * @param status Used as the status of the response if given. Else response status is defaulted to 200.
 */
function createReadableStreamResponse (obj: object, status?: number): Response {
  const stream = new Readable({ objectMode: true });
  stream.push(JSON.stringify(obj));

  const response = new Response(stream, { status: status ? status : 200 });
  return response;
}

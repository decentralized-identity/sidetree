import * as retry from 'async-retry';
import * as fetchMock from 'fetch-mock';
import DownloadManager from '../src/DownloadManager';
import Observer from '../src/Observer';
import { BlockchainClient } from '../src/Blockchain';
import { CasClient } from '../src/Cas';
import { Config, ConfigKey } from '../src/Config';
import { createOperationProcessor, OperationProcessor } from '../src/OperationProcessor';
import { OperationStore } from '../src/OperationStore';
import { MockOperationStoreImpl } from './mocks/MockOperationStore';
import { Response } from 'node-fetch';
import { Readable } from 'readable-stream';

describe('Observer', async () => {
  const configFile = require('../json/config-test.json');
  const config = new Config(configFile);

  let mockCasFetch;
  let cas;
  let downloadManager: DownloadManager;
  let operationProcessor: OperationProcessor;
  let operationStore: OperationStore;

  const originalDefaultTestTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;

  beforeAll(async () => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 20000; // These asynchronous tests can take a bit longer than normal.

    mockCasFetch = fetchMock.sandbox().get('*', 404); // Setting the CAS to always return 404.
    cas = new CasClient(config[ConfigKey.CasNodeUri], mockCasFetch);
    downloadManager = new DownloadManager(+config[ConfigKey.MaxConcurrentCasDownloads], cas);
    operationStore = new MockOperationStoreImpl();
    operationProcessor = createOperationProcessor(config, operationStore);
    await operationProcessor.initialize();

    downloadManager.start();
  });

  afterAll(() => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = originalDefaultTestTimeout;
  });

  afterEach(() => {
    fetchMock.sandbox().reset();
    fetchMock.reset();
  });

  it('should record transactions processed.', async () => {
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
    const observer = new Observer(blockchainClient, downloadManager, operationProcessor, 1);
    const processedTransactions = observer.getProcessedTransactions();
    await observer.startPeriodicProcessing(); // Asynchronously triggers Observer to start processing transactions immediately.

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
    const subsequentTransactionFetchResponseBody = {
      'moreTransactions': false,
      'transactions': []
    };
    const mockNodeFetch = fetchMock.sandbox().getOnce('*', createReadableStreamResponse(initialTransactionFetchResponseBody))
                                             .get('http://127.0.0.1:3009/transactions?since=3&transaction-time-hash=3000',
                                               createReadableStreamResponse({ code: 'invalid_transaction_number_or_time_hash' }, 400))
                                             .post('*', createReadableStreamResponse(initialTransactionFetchResponseBody.transactions[0]))
                                             .get('http://127.0.0.1:3009/transactions?since=1&transaction-time-hash=1000',
                                               createReadableStreamResponse(transactionFetchResponseBodyAfterBlockReorg))
                                             .get('http://127.0.0.1:3009/transactions?since=4&transaction-time-hash=4000',
                                               createReadableStreamResponse(subsequentTransactionFetchResponseBody));
    const blockchainClient = new BlockchainClient(config[ConfigKey.BlockchainNodeUri], mockNodeFetch);

    // Process first set of transactions.
    const observer = new Observer(blockchainClient, downloadManager, operationProcessor, 1);
    await observer.startPeriodicProcessing(); // Asynchronously triggers Observer to start processing transactions immediately.

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
      minTimeout: 1000, // milliseconds
      maxTimeout: 1000 // milliseconds
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
function createReadableStreamResponse (content: object, status?: number): Response {
  // const stream = new Readable({ objectMode: true });
  const stream = new RepeatingReadable(content);
  stream.push(JSON.stringify(content));

  const response = new Response(stream, { status: status ? status : 200 });
  return response;
}

// NOTE: Be careful, this mock Readable will NOT work for reader who is reading based on events (e.g. current CasClient), it will result in a deadlock.
/**
 * A mock class that extends the `Readable` class that will repeatedly return the same JSON object everytime `read()` is invoked.
 * NOTE: This mock `Readable` currently will NOT work for consumer who is consuming the `Readable` using events
 * (e.g. current CasClient), it will result in a deadlock.
 */
class RepeatingReadable extends Readable {

  /**
   * @param content The content object to be returned everytime `read()` is invoked.
   */
  constructor (private content: object) {
    super({ objectMode: true });
  }

  /**
   * Overrides the parent class's `read()` behavior such that `this.content` will be returned everytime this method is invoked.
   */
  public read (_size?: number): string | Buffer {
    this.push(JSON.stringify(this.content));
    const result = super.read();
    return result;
  }
}

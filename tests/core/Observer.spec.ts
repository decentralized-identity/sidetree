import * as retry from 'async-retry';
import DownloadManager from '../../lib/core/DownloadManager';
import ErrorCode from '../../lib/common/ErrorCode';
import MockOperationStore from '../mocks/MockOperationStore';
import Observer from '../../lib/core/Observer';
import OperationProcessor from '../../lib/core/OperationProcessor';
import { BlockchainClient } from '../../lib/core/Blockchain';
import { CasClient } from '../../lib/core/Cas';
import { FetchResultCode } from '../../lib/common/FetchResultCode';
import { MockTransactionStore } from '../mocks/MockTransactionStore';
import { OperationStore } from '../../lib/core/OperationStore';
import { SidetreeError } from '../../lib/core/Error';

describe('Observer', async () => {
  const config = require('../json/config-test.json');

  let casClient;
  let downloadManager: DownloadManager;
  let operationProcessor: OperationProcessor;
  let operationStore: OperationStore;

  const originalDefaultTestTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;

  beforeAll(async () => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 20000; // These asynchronous tests can take a bit longer than normal.

    casClient = new CasClient(config.contentAddressableStoreServiceUri);

    // Setting the CAS to always return 404.
    spyOn(casClient, 'read').and.returnValue(Promise.resolve({ code: FetchResultCode.NotFound }));

    downloadManager = new DownloadManager(config.maxConcurrentDownloads, casClient);
    operationStore = new MockOperationStore();
    operationProcessor = new OperationProcessor(config.didMethodName, operationStore);

    downloadManager.start();
  });

  afterAll(() => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = originalDefaultTestTimeout;
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

    const blockchainClient = new BlockchainClient(config.blockchainServiceUri);

    let readInvocationCount = 0;
    const mockReadFunction = async () => {
      readInvocationCount++;
      if (readInvocationCount === 1) {
        return initialTransactionFetchResponseBody;
      } else {
        return subsequentTransactionFetchResponseBody;
      }
    };
    spyOn(blockchainClient, 'read').and.callFake(mockReadFunction);

    // Start the Observer.
    const transactionStore = new MockTransactionStore();
    const observer = new Observer(blockchainClient, downloadManager, operationProcessor, transactionStore, transactionStore, 1);
    const processedTransactions = transactionStore.getTransactions();
    await observer.startPeriodicProcessing(); // Asynchronously triggers Observer to start processing transactions immediately.

    // Monitor the processed transactions list until change is detected or max retries is reached.
    await retry(async _bail => {
      const processedTransactionCount = transactionStore.getTransactions().length;
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

    const blockchainClient = new BlockchainClient(config.blockchainServiceUri);

    let readInvocationCount = 0;
    const mockReadFunction = async () => {
      readInvocationCount++;
      if (readInvocationCount === 1) {
        // 1st call returns initial set of transactions.
        return initialTransactionFetchResponseBody;
      } if (readInvocationCount === 2) {
        // 2nd call simulates a block reorganization.
        throw new SidetreeError(ErrorCode.InvalidTransactionNumberOrTimeHash);
      } if (readInvocationCount === 3) {
        // 3nd call occurs after the 'getFirstValidTransaction' call and returns the 'correct' set of transactions.
        return transactionFetchResponseBodyAfterBlockReorg;
      } else {
        return subsequentTransactionFetchResponseBody;
      }
    };
    spyOn(blockchainClient, 'read').and.callFake(mockReadFunction);

    // Make the `getFirstValidTransaction` call return the first transaction as the most recent knwon valid transactions.
    spyOn(blockchainClient, 'getFirstValidTransaction').and.returnValue(Promise.resolve(initialTransactionFetchResponseBody.transactions[0]));

    // Process first set of transactions.
    const transactionStore = new MockTransactionStore();
    const observer = new Observer(blockchainClient, downloadManager, operationProcessor, transactionStore, transactionStore, 1);
    await observer.startPeriodicProcessing(); // Asynchronously triggers Observer to start processing transactions immediately.

    // Monitor the processed transactions list until the expected count or max retries is reached.
    const processedTransactions = transactionStore.getTransactions();
    await retry(async _bail => {
      const processedTransactionCount = processedTransactions.length;
      if (processedTransactionCount === 4) {
        return;
      }

      // NOTE: if anything throws, we retry.
      throw new Error('Block reorganization not handled.');
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

import * as retry from 'async-retry';
import AnchorFileModel from '../../lib/core/versions/latest/models/AnchorFileModel';
import BatchFileModel from '../../lib/core/versions/latest/models/BatchFileModel';
import Blockchain from '../../lib/core/Blockchain';
import Cas from '../../lib/core/Cas';
import DownloadManager from '../../lib/core/DownloadManager';
import ErrorCode from '../../lib/common/SharedErrorCode';
import FetchResult from '../../lib/common/models/FetchResult';
import IOperationStore from '../../lib/core/interfaces/IOperationStore';
import MockOperationStore from '../mocks/MockOperationStore';
import Observer from '../../lib/core/Observer';
import TransactionModel from '../../lib/common/models/TransactionModel';
import TransactionProcessor from '../../lib/core/versions/latest/TransactionProcessor';
import { FetchResultCode } from '../../lib/common/FetchResultCode';
import { MockTransactionStore } from '../mocks/MockTransactionStore';
import { SidetreeError } from '../../lib/core/Error';

describe('Observer', async () => {
  const config = require('../json/config-test.json');

  let getTransactionProcessor: (blockchainTime: number) => TransactionProcessor;

  let casClient;
  let downloadManager: DownloadManager;
  let operationStore: IOperationStore;
  let transactionStore: MockTransactionStore;

  const originalDefaultTestTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;

  beforeAll(async () => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 20000; // These asynchronous tests can take a bit longer than normal.

    casClient = new Cas(config.contentAddressableStoreServiceUri);

    // Setting the CAS to always return 404.
    spyOn(casClient, 'read').and.returnValue(Promise.resolve({ code: FetchResultCode.NotFound }));

    operationStore = new MockOperationStore();
    transactionStore = new MockTransactionStore();
    downloadManager = new DownloadManager(config.maxConcurrentDownloads, casClient);
    downloadManager.start();

    getTransactionProcessor = (_blockchainTime: number) => new TransactionProcessor(downloadManager, operationStore);
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
          'anchorString': '1stTransaction'
        },
        {
          'transactionNumber': 2,
          'transactionTime': 1000,
          'transactionTimeHash': '1000',
          'anchorString': '2ndTransaction'
        }
      ]
    };
    const subsequentTransactionFetchResponseBody = {
      'moreTransactions': false,
      'transactions': []
    };

    const blockchainClient = new Blockchain(config.blockchainServiceUri);

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
    const observer = new Observer(
      getTransactionProcessor,
      blockchainClient,
      config.maxConcurrentDownloads,
      operationStore,
      transactionStore,
      transactionStore,
      1
    );

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

    expect(processedTransactions[0].anchorString).toEqual('1stTransaction');
    expect(processedTransactions[1].anchorString).toEqual('2ndTransaction');
  });

  it('should process a valid operation batch successfully.', async () => {
    // Prepare the mock response from the DownloadManager.
    const anchorFile: AnchorFileModel = {
      batchFileHash: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
      didUniqueSuffixes: ['EiCRzEqU4vFsVw5BwIlCpArFSt2OQuu5RNiYUS2wRSt5Xw', 'EiD7UhzVMsGz1hsGLDkMUyjNxOIS-hlmNo2cuRlexO9Hgg'],
      merkleRoot: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA'
    };
    const anchoreFileFetchResult: FetchResult = {
      code: FetchResultCode.Success,
      content: Buffer.from(JSON.stringify(anchorFile))
    };
    const batchFile: BatchFileModel = {
      /* tslint:disable */
      // Encoded raw operations with valid signatures
      operations: [
        'eyJoZWFkZXIiOnsib3BlcmF0aW9uIjoiY3JlYXRlIiwia2lkIjoiI2tleTEiLCJhbGciOiJFUzI1NksifSwicGF5bG9hZCI6ImV5SkFZMjl1ZEdWNGRDSTZJbWgwZEhCek9pOHZkek5wWkM1dmNtY3ZaR2xrTDNZeElpd2ljSFZpYkdsalMyVjVJanBiZXlKcFpDSTZJaU5yWlhreElpd2lkSGx3WlNJNklsTmxZM0F5TlRack1WWmxjbWxtYVdOaGRHbHZia3RsZVRJd01UZ2lMQ0oxYzJGblpTSTZJbkpsWTI5MlpYSjVJaXdpY0hWaWJHbGpTMlY1U0dWNElqb2lNRE5tTVRWbU5XWXhaak15TXprNE5HWXdaak00T0dFNFlUQXpZV05qWlRReFlqVmxabVJsWVRJMU9HUXdNall4TXpGa01EWTNOR0ptWmpoa056UTNOemt3SW4wc2V5SnBaQ0k2SWlOclpYa3lJaXdpZEhsd1pTSTZJbEp6WVZabGNtbG1hV05oZEdsdmJrdGxlVEl3TVRnaUxDSjFjMkZuWlNJNkluTnBaMjVwYm1jaUxDSndkV0pzYVdOTFpYbFFaVzBpT2lJdExTMHRMVUpGUjBsT0lGQlZRa3hKUXlCTFJWa3VNaTVGVGtRZ1VGVkNURWxESUV0RldTMHRMUzB0SW4xZExDSnpaWEoyYVdObElqcGJleUpwWkNJNklrbGtaVzUwYVhSNVNIVmlJaXdpZEhsd1pTSTZJa2xrWlc1MGFYUjVTSFZpSWl3aWMyVnlkbWxqWlVWdVpIQnZhVzUwSWpwN0lrQmpiMjUwWlhoMElqb2ljMk5vWlcxaExtbGtaVzUwYVhSNUxtWnZkVzVrWVhScGIyNHZhSFZpSWl3aVFIUjVjR1VpT2lKVmMyVnlVMlZ5ZG1salpVVnVaSEJ2YVc1MElpd2lhVzV6ZEdGdVkyVWlPbHNpWkdsa09uTnBaR1YwY21WbE9uWmhiSFZsTUNKZGZYMWRmUSIsInNpZ25hdHVyZSI6InU4QkdwTEs4bjZSU2x5ZWZQeW9ra3pvQnRBbEVnWG56SjktR3pySkN3bDRqZjcxX2pRMGotRlFuaU51NS01d0UxTEExRWJRb1VqdzZHaG9tMzdRYlZ3In0',
        'eyJoZWFkZXIiOnsib3BlcmF0aW9uIjoiY3JlYXRlIiwia2lkIjoiI2tleTEiLCJhbGciOiJFUzI1NksifSwicGF5bG9hZCI6ImV5SkFZMjl1ZEdWNGRDSTZJbWgwZEhCek9pOHZkek5wWkM1dmNtY3ZaR2xrTDNZeElpd2ljSFZpYkdsalMyVjVJanBiZXlKcFpDSTZJaU5yWlhreElpd2lkSGx3WlNJNklsTmxZM0F5TlRack1WWmxjbWxtYVdOaGRHbHZia3RsZVRJd01UZ2lMQ0oxYzJGblpTSTZJbkpsWTI5MlpYSjVJaXdpY0hWaWJHbGpTMlY1U0dWNElqb2lNREprWlRsa1l6WXdNemMzWXpRME5qTXhPVFl5TjJJNE1qVmhZV1UyTlRGak5qZzJaVFZoWlRFMVlqVmxOMlU0WkRZd1lUYzJORFF4WmpNMlpUUTVabU5pSW4wc2V5SnBaQ0k2SWlOclpYa3lJaXdpZEhsd1pTSTZJbEp6WVZabGNtbG1hV05oZEdsdmJrdGxlVEl3TVRnaUxDSjFjMkZuWlNJNkluTnBaMjVwYm1jaUxDSndkV0pzYVdOTFpYbFFaVzBpT2lJdExTMHRMVUpGUjBsT0lGQlZRa3hKUXlCTFJWa3VNaTVGVGtRZ1VGVkNURWxESUV0RldTMHRMUzB0SW4xZExDSnpaWEoyYVdObElqcGJleUpwWkNJNklrbGtaVzUwYVhSNVNIVmlJaXdpZEhsd1pTSTZJa2xrWlc1MGFYUjVTSFZpSWl3aWMyVnlkbWxqWlVWdVpIQnZhVzUwSWpwN0lrQmpiMjUwWlhoMElqb2ljMk5vWlcxaExtbGtaVzUwYVhSNUxtWnZkVzVrWVhScGIyNHZhSFZpSWl3aVFIUjVjR1VpT2lKVmMyVnlVMlZ5ZG1salpVVnVaSEJ2YVc1MElpd2lhVzV6ZEdGdVkyVWlPbHNpWkdsa09uTnBaR1YwY21WbE9uWmhiSFZsTUNKZGZYMWRmUSIsInNpZ25hdHVyZSI6IkNUdGFRRUNMTjBlbjFfTkg5QU5IbTViTEhGTV83bGlWSVRjYWRGSE9SdlZSSldGdGgzUXdPV0dnNnpsanl2aENpWmdKOENma3FXNmhXanUwZnVkNmVnIn0'
      ]
      /* tslint:enable */
    };
    const batchFileFetchResult: FetchResult = {
      code: FetchResultCode.Success,
      content: Buffer.from(JSON.stringify(batchFile))
    };

    const mockDownloadFunction = async (hash: string) => {
      if (hash === 'EiA_psBVqsuGjoYXMIRrcW_mPUG1yDXbh84VPXOuVQ5oqw') {
        return anchoreFileFetchResult;
      } else if (hash === 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA') {
        return batchFileFetchResult;
      } else {
        throw new Error('Test failed, unexpected hash given');
      }
    };
    spyOn(downloadManager, 'download').and.callFake(mockDownloadFunction);

    const blockchainClient = new Blockchain(config.blockchainServiceUri);
    const observer = new Observer(
      getTransactionProcessor,
      blockchainClient,
      config.maxConcurrentDownloads,
      operationStore,
      transactionStore,
      transactionStore,
      1
    );

    const mockTransaction: TransactionModel = {
      transactionNumber: 1,
      transactionTime: 1000000,
      transactionTimeHash: '1000',
      anchorString: 'EiA_psBVqsuGjoYXMIRrcW_mPUG1yDXbh84VPXOuVQ5oqw'
    };
    const transactionUnderProcessing = {
      transaction: mockTransaction,
      processingStatus: 'pending'
    };
    await (observer as any).processTransaction(mockTransaction, transactionUnderProcessing);

    const operationArray1 = await operationStore.get('EiCRzEqU4vFsVw5BwIlCpArFSt2OQuu5RNiYUS2wRSt5Xw');
    expect(operationArray1.length).toEqual(1);

    const operationArray2 = await operationStore.get('EiD7UhzVMsGz1hsGLDkMUyjNxOIS-hlmNo2cuRlexO9Hgg');
    expect(operationArray2.length).toEqual(1);
  });

  // Testing invalid anchor file scenarios:
  const invalidAnchorFileTestsInput = [
    [FetchResultCode.MaxSizeExceeded, 'exceeded max size limit'],
    [FetchResultCode.NotAFile, 'is not a file'],
    [FetchResultCode.InvalidHash, 'is not a valid hash']
  ];
  for (let tuple of invalidAnchorFileTestsInput) {
    const mockFetchReturnCode = tuple[0];
    const expectedConsoleLogSubstring = tuple[1];

    it(`should stop processing a transaction if ${mockFetchReturnCode}`, async () => {
      const blockchainClient = new Blockchain(config.blockchainServiceUri);
      const observer = new Observer(
        getTransactionProcessor,
        blockchainClient,
        config.maxConcurrentDownloads,
        operationStore,
        transactionStore,
        transactionStore,
        1
      );

      spyOn(downloadManager, 'download').and.returnValue(Promise.resolve({ code: mockFetchReturnCode as FetchResultCode }));

      let expectedConsoleLogDetected = false;
      spyOn(global.console, 'info').and.callFake((message: string) => {
        if (message.includes(expectedConsoleLogSubstring)) {
          expectedConsoleLogDetected = true;
        }
      });

      spyOn(transactionStore, 'removeUnresolvableTransaction');
      spyOn(transactionStore, 'recordUnresolvableTransactionFetchAttempt');

      const mockTransaction: TransactionModel = {
        transactionNumber: 1,
        transactionTime: 1000000,
        transactionTimeHash: '1000',
        anchorString: 'EiA_psBVqsuGjoYXMIRrcW_mPUG1yDXbh84VPXOuVQ5oqw'
      };
      const transactionUnderProcessing = {
        transaction: mockTransaction,
        processingStatus: 'pending'
      };
      await (observer as any).processTransaction(mockTransaction, transactionUnderProcessing);

      expect(expectedConsoleLogDetected).toBeTruthy();
      expect(transactionStore.removeUnresolvableTransaction).toHaveBeenCalled();
      expect(transactionStore.recordUnresolvableTransactionFetchAttempt).not.toHaveBeenCalled();
    });
  }

  it('should detect and handle block reorganization correctly.', async () => {
    // Prepare the mock response from blockchain service.
    const initialTransactionFetchResponseBody = {
      'moreTransactions': false,
      'transactions': [
        {
          'transactionNumber': 1,
          'transactionTime': 1000,
          'transactionTimeHash': '1000',
          'anchorString': '1stTransaction'
        },
        {
          'transactionNumber': 2,
          'transactionTime': 2000,
          'transactionTimeHash': '2000',
          'anchorString': '2ndTransaction'
        },
        {
          'transactionNumber': 3,
          'transactionTime': 3000,
          'transactionTimeHash': '3000',
          'anchorString': '3rdTransaction'
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
          'anchorString': '2ndTransactionNew'
        },
        {
          'transactionNumber': 3,
          'transactionTime': 3001,
          'transactionTimeHash': '3000',
          'anchorString': '3rdTransactionNew'
        },
        {
          'transactionNumber': 4,
          'transactionTime': 4000,
          'transactionTimeHash': '4000',
          'anchorString': '4thTransaction'
        }
      ]
    };
    const subsequentTransactionFetchResponseBody = {
      'moreTransactions': false,
      'transactions': []
    };

    const blockchainClient = new Blockchain(config.blockchainServiceUri);

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
    const observer = new Observer(
      getTransactionProcessor,
      blockchainClient,
      config.maxConcurrentDownloads,
      operationStore,
      transactionStore,
      transactionStore,
      1
    );

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

    expect(processedTransactions[1].anchorString).toEqual('2ndTransactionNew');
    expect(processedTransactions[2].anchorString).toEqual('3rdTransactionNew');
    expect(processedTransactions[3].anchorString).toEqual('4thTransaction');
  });
});

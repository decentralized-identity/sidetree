import * as retry from 'async-retry';
import AnchorFile from '../../lib/core/versions/latest/models/AnchorFileModel';
import BatchFile from '../../lib/core/versions/latest/models/BatchFileModel';
import DownloadManager from '../../lib/core/DownloadManager';
import ErrorCode from '../../lib/common/ErrorCode';
import IFetchResult from '../../lib/common/IFetchResult';
import IOperationStore from '../../lib/core/interfaces/IOperationStore';
import ITransaction from '../../lib/common/ITransaction';
import MockOperationStore from '../mocks/MockOperationStore';
import Observer from '../../lib/core/Observer';
import TransactionProcessor from '../../lib/core/versions/latest/TransactionProcessor';
import { BlockchainClient } from '../../lib/core/Blockchain';
import { CasClient } from '../../lib/core/Cas';
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

    casClient = new CasClient(config.contentAddressableStoreServiceUri);

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

    expect(processedTransactions[0].anchorFileHash).toEqual('1stTransaction');
    expect(processedTransactions[1].anchorFileHash).toEqual('2ndTransaction');
  });

  it('should process a valid operation batch successfully.', async () => {
    // Prepare the mock response from the DownloadManager.
    const anchorFile: AnchorFile = {
      batchFileHash: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA',
      didUniqueSuffixes: ['EiA-GtHEOH9IcEEoBQ9p1KCMIjTmTO8x2qXJPb20ry6C0A', 'EiA4zvhtvzTdeLAg8_Pvdtk5xJreNuIpvSpCCbtiTVc8Ow'],
      merkleRoot: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA'
    };
    const anchoreFileFetchResult: IFetchResult = {
      code: FetchResultCode.Success,
      content: Buffer.from(JSON.stringify(anchorFile))
    };
    const batchFile: BatchFile = {
      /* tslint:disable */
      operations: [
        'eyJwYXlsb2FkIjoiZXlKamNtVmhkR1ZrSWpvaU1qQXhPUzB3TmkweE5GUXlNam94TkRvME5pNDVORE5hSWl3aVFHTnZiblJsZUhRaU9pSm9kSFJ3Y3pvdkwzY3phV1F1YjNKbkwyUnBaQzkyTVNJc0luQjFZbXhwWTB0bGVTSTZXM3NpYVdRaU9pSWphMlY1TVNJc0luUjVjR1VpT2lKVFpXTndNalUyYXpGV1pYSnBabWxqWVhScGIyNUxaWGt5TURFNElpd2ljSFZpYkdsalMyVjVTbmRySWpwN0ltdHBaQ0k2SWlOclpYa3hJaXdpYTNSNUlqb2lSVU1pTENKaGJHY2lPaUpGVXpJMU5rc2lMQ0pqY25ZaU9pSlFMVEkxTmtzaUxDSjRJam9pTjFGWFRVUjFkRmh3UkdodFVFcHhPWGxDWmxNMmVWVmpaMmxQVDJWTWIxVmplazVPVW5Wd1ZEZElNQ0lzSW5raU9pSnRNVVJIVWpCMldEZHNXRlZLTWtwcU1WQmtNRU5yZWxneFVuSkxiVmhuZERSNk5tMUZUV0Y1ZDNCSkluMTlYWDAiLCJzaWduYXR1cmUiOiJNRVVDSUNnWXk3TmRuRDhZVmhsTXhqaWFJVW11d3VhRHliM2xjNVAzZFVPSlpmVUpBaUVBMGtNbi03anFuaFQtMm5RVk52YldXRmk1NkNDajMweEVZRWxDNmFCMXVRayIsInByb3RlY3RlZCI6ImUzMCIsImhlYWRlciI6eyJvcGVyYXRpb24iOiJjcmVhdGUiLCJwcm9vZk9mV29yayI6IiIsImtpZCI6IiNrZXkxIiwiYWxnIjoiRVMyNTZLIn19',
        'eyJwYXlsb2FkIjoiZXlKamNtVmhkR1ZrSWpvaU1qQXhPUzB3TmkweE5GUXlNam95TVRveE55NDVOalphSWl3aVFHTnZiblJsZUhRaU9pSm9kSFJ3Y3pvdkwzY3phV1F1YjNKbkwyUnBaQzkyTVNJc0luQjFZbXhwWTB0bGVTSTZXM3NpYVdRaU9pSWphMlY1TVNJc0luUjVjR1VpT2lKVFpXTndNalUyYXpGV1pYSnBabWxqWVhScGIyNUxaWGt5TURFNElpd2ljSFZpYkdsalMyVjVTbmRySWpwN0ltdHBaQ0k2SWlOclpYa3hJaXdpYTNSNUlqb2lSVU1pTENKaGJHY2lPaUpGVXpJMU5rc2lMQ0pqY25ZaU9pSlFMVEkxTmtzaUxDSjRJam9pTjFGWFRVUjFkRmh3UkdodFVFcHhPWGxDWmxNMmVWVmpaMmxQVDJWTWIxVmplazVPVW5Wd1ZEZElNQ0lzSW5raU9pSnRNVVJIVWpCMldEZHNXRlZLTWtwcU1WQmtNRU5yZWxneFVuSkxiVmhuZERSNk5tMUZUV0Y1ZDNCSkluMTlYWDAiLCJzaWduYXR1cmUiOiJNRVFDSUQ3bjd5Rkk2Smc0aHpKcl9taTY2NjM1X2pPV0RGZnBucmRzMXA4X1ZWRDhBaUFzTEkwTC13WFpUdEhBNExXX0FDZlVBS1N1SEdwYWJhNXVxZXZTQTJkempRIiwicHJvdGVjdGVkIjoiZTMwIiwiaGVhZGVyIjp7Im9wZXJhdGlvbiI6ImNyZWF0ZSIsInByb29mT2ZXb3JrIjoiIiwia2lkIjoiI2tleTEiLCJhbGciOiJFUzI1NksifX0'
      ]
      /* tslint:enable */
    };
    const batchFileFetchResult: IFetchResult = {
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

    const blockchainClient = new BlockchainClient(config.blockchainServiceUri);
    const observer = new Observer(
      getTransactionProcessor,
      blockchainClient,
      config.maxConcurrentDownloads,
      operationStore,
      transactionStore,
      transactionStore,
      1
    );

    const mockTransaction: ITransaction = {
      transactionNumber: 1,
      transactionTime: 1000000,
      transactionTimeHash: '1000',
      anchorFileHash: 'EiA_psBVqsuGjoYXMIRrcW_mPUG1yDXbh84VPXOuVQ5oqw'
    };
    const transactionUnderProcessing = {
      transaction: mockTransaction,
      processingStatus: 'pending'
    };
    await (observer as any).processTransaction(mockTransaction, transactionUnderProcessing);

    const operationArray1 = await operationStore.get('EiA-GtHEOH9IcEEoBQ9p1KCMIjTmTO8x2qXJPb20ry6C0A');
    expect(operationArray1.length).toEqual(1);

    const operationArray2 = await operationStore.get('EiA4zvhtvzTdeLAg8_Pvdtk5xJreNuIpvSpCCbtiTVc8Ow');
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
      const blockchainClient = new BlockchainClient(config.blockchainServiceUri);
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

      const mockTransaction: ITransaction = {
        transactionNumber: 1,
        transactionTime: 1000000,
        transactionTimeHash: '1000',
        anchorFileHash: 'EiA_psBVqsuGjoYXMIRrcW_mPUG1yDXbh84VPXOuVQ5oqw'
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

    expect(processedTransactions[1].anchorFileHash).toEqual('2ndTransactionNew');
    expect(processedTransactions[2].anchorFileHash).toEqual('3rdTransactionNew');
    expect(processedTransactions[3].anchorFileHash).toEqual('4thTransaction');
  });
});

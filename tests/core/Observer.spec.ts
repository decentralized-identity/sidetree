import * as retry from 'async-retry';
import AnchorFile from '../../lib/core/versions/latest/AnchorFile';
import AnchorFileModel from '../../lib/core/versions/latest/models/AnchorFileModel';
import BatchFile from '../../lib/core/versions/latest/BatchFile';
import Blockchain from '../../lib/core/Blockchain';
import Cas from '../../lib/core/Cas';
import Cryptography from '../../lib/core/versions/latest/util/Cryptography';
import DownloadManager from '../../lib/core/DownloadManager';
import Encoder from '../../lib/core/versions/latest/Encoder';
import ErrorCode from '../../lib/common/SharedErrorCode';
import FetchResult from '../../lib/common/models/FetchResult';
import IOperationStore from '../../lib/core/interfaces/IOperationStore';
import MockOperationStore from '../mocks/MockOperationStore';
import Multihash from '../../lib/core/versions/latest/Multihash';
import Observer from '../../lib/core/Observer';
import Operation from '../../lib/core/versions/latest/Operation';
import OperationGenerator from '../generators/OperationGenerator';
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
    const didDocumentTemplate = require('../json/didDocumentTemplate.json');

    const [publicKey1, privateKey1] = await Cryptography.generateKeyPairHex('#key1');
    const [publicKey2, privateKey2] = await Cryptography.generateKeyPairHex('#key2');
    const operations = [
      await OperationGenerator.generateCreateOperation(didDocumentTemplate, publicKey1, privateKey1),
      await OperationGenerator.generateCreateOperation(didDocumentTemplate, publicKey2, privateKey2)
    ];
    const operationsBuffer = operations.map((op) => { return Buffer.from(JSON.stringify(op)); });
    const batchFileBuffer = await BatchFile.fromOperationBuffers(operationsBuffer);

    const batchFileFetchResult: FetchResult = {
      code: FetchResultCode.Success,
      content: batchFileBuffer
    };

    const batchFilehash = Encoder.encode(Multihash.hash(batchFileBuffer, 18));

    const operationDids = operationsBuffer.map((op) => { return Operation.create(op).didUniqueSuffix; });
    const anchorFile: AnchorFileModel = {
      batchFileHash: batchFilehash,
      didUniqueSuffixes: operationDids,
      merkleRoot: 'EiB4ypIXxG9aFhXv2YC8I2tQvLEBbQAsNzHmph17vMfVYA'
    };

    const anchorFileBuffer = await AnchorFile.createBufferFromAnchorFileModel(anchorFile);

    const anchoreFileFetchResult: FetchResult = {
      code: FetchResultCode.Success,
      content: anchorFileBuffer
    };

    const anchorFilehash = Encoder.encode(Multihash.hash(anchorFileBuffer, 18));

    const mockDownloadFunction = async (hash: string) => {
      if (hash === anchorFilehash) {
        return anchoreFileFetchResult;
      } else if (hash === batchFilehash) {
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
      anchorString: anchorFilehash
    };
    const transactionUnderProcessing = {
      transaction: mockTransaction,
      processingStatus: 'pending'
    };
    await (observer as any).processTransaction(mockTransaction, transactionUnderProcessing);

    operationDids.forEach(async (did) => {
      const operationArray = await operationStore.get(did);
      expect(operationArray.length).toEqual(1);
    });
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

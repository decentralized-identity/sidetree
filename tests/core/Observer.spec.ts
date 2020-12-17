import * as retry from 'async-retry';
import AnchoredDataSerializer from '../../lib/core/versions/latest/AnchoredDataSerializer';
import Blockchain from '../../lib/core/Blockchain';
import ChunkFile from '../../lib/core/versions/latest/ChunkFile';
import CoreIndexFile from '../../lib/core/versions/latest/CoreIndexFile';
import DownloadManager from '../../lib/core/DownloadManager';
import ErrorCode from '../../lib/common/SharedErrorCode';
import FetchResult from '../../lib/common/models/FetchResult';
import FetchResultCode from '../../lib/common/enums/FetchResultCode';
import IOperationStore from '../../lib/core/interfaces/IOperationStore';
import IVersionManager from '../../lib/core/interfaces/IVersionManager';
import Ipfs from '../../lib/ipfs/Ipfs';
import MockBlockchain from '../mocks/MockBlockchain';
import MockOperationStore from '../mocks/MockOperationStore';
import MockTransactionStore from '../mocks/MockTransactionStore';
import MockVersionManager from '../mocks/MockVersionManager';
import Observer from '../../lib/core/Observer';
import OperationGenerator from '../generators/OperationGenerator';
import ProvisionalIndexFile from '../../lib/core/versions/latest/ProvisionalIndexFile';
import SidetreeError from '../../lib/common/SidetreeError';
import TransactionModel from '../../lib/common/models/TransactionModel';
import { TransactionProcessingStatus } from '../../lib/core/models/TransactionUnderProcessingModel';
import TransactionProcessor from '../../lib/core/versions/latest/TransactionProcessor';
import TransactionSelector from '../../lib/core/versions/latest/TransactionSelector';
import Logger from '../../lib/common/Logger';

describe('Observer', async () => {
  const config = require('../json/config-test.json');

  let casClient;
  let downloadManager: DownloadManager;
  let operationStore: IOperationStore;
  let transactionStore: MockTransactionStore;
  let blockchain: MockBlockchain;
  let versionManager: IVersionManager;
  let getTransactionProcessorSpy: jasmine.Spy;

  const originalDefaultTestTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;

  beforeAll(async () => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 20000; // These asynchronous tests can take a bit longer than normal.

    const fetchTimeoutInSeconds = 1;
    casClient = new Ipfs('unusedUri', fetchTimeoutInSeconds);

    // Setting the CAS to always return 404.
    spyOn(casClient, 'read').and.returnValue(Promise.resolve({ code: FetchResultCode.NotFound }));

    operationStore = new MockOperationStore();
    transactionStore = new MockTransactionStore();
    downloadManager = new DownloadManager(config.maxConcurrentDownloads, casClient);
    downloadManager.start();
    blockchain = new MockBlockchain();
    const versionMetadataFetcher = {} as any;

    // Mock the blockchain to return an empty lock
    spyOn(blockchain, 'getValueTimeLock').and.returnValue(Promise.resolve(undefined));

    const transactionProcessor = new TransactionProcessor(downloadManager, operationStore, blockchain, versionMetadataFetcher);
    const transactionSelector = new TransactionSelector(transactionStore);
    versionManager = new MockVersionManager();

    getTransactionProcessorSpy = spyOn(versionManager, 'getTransactionProcessor');
    getTransactionProcessorSpy.and.returnValue(transactionProcessor);
    spyOn(versionManager, 'getTransactionSelector').and.returnValue(transactionSelector);
  });

  afterAll(() => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = originalDefaultTestTimeout;
  });

  beforeEach(() => {
    transactionStore = new MockTransactionStore();
  });

  it('should record transactions processed with expected outcome.', async () => {
    // Prepare the mock response from blockchain service.
    const initialTransactionFetchResponseBody = {
      moreTransactions: false,
      transactions: [
        {
          transactionNumber: 1,
          transactionTime: 1000,
          transactionTimeHash: '1000',
          anchorString: '1stTransaction',
          transactionFeePaid: 1,
          normalizedTransactionFee: 1,
          writer: 'writer1'
        },
        {
          transactionNumber: 2,
          transactionTime: 1000,
          transactionTimeHash: '1000',
          anchorString: '2ndTransaction',
          transactionFeePaid: 2,
          normalizedTransactionFee: 2,
          writer: 'writer2'
        }
      ]
    };
    const subsequentTransactionFetchResponseBody = {
      moreTransactions: false,
      transactions: []
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
      versionManager,
      blockchainClient,
      config.maxConcurrentDownloads,
      operationStore,
      transactionStore,
      transactionStore,
      1
    );

    // mocking throughput limiter to make testing easier
    spyOn(observer['throughputLimiter'], 'getQualifiedTransactions').and.callFake(
      (transactions: TransactionModel[]) => {
        return new Promise((resolve) => { resolve(transactions); });
      }
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
      throw new Error('Incorrect number of changes to the processed transactions list.');
    }, {
      retries: 10,
      minTimeout: 500, // milliseconds
      maxTimeout: 500 // milliseconds
    });

    observer.stopPeriodicProcessing(); // Asynchronously stops Observer from processing more transactions after the initial processing cycle.

    // throughput limiter applies logic to filter out some transactions
    expect(processedTransactions.length).toEqual(2);
    expect(processedTransactions[0].anchorString).toEqual('1stTransaction');
    expect(processedTransactions[1].anchorString).toEqual('2ndTransaction');
  });

  it('should process a valid operation batch successfully.', async () => {
    const operation1Data = await OperationGenerator.generateAnchoredCreateOperation({ transactionTime: 1, transactionNumber: 1, operationIndex: 1 });
    const operation2Data = await OperationGenerator.generateAnchoredCreateOperation({ transactionTime: 1, transactionNumber: 1, operationIndex: 2 });
    const createOperations = [operation1Data.createOperation, operation2Data.createOperation];

    const coreProofFileUri = undefined;

    // Generating chunk file data.
    const mockChunkFileBuffer = await ChunkFile.createBuffer(createOperations, [], []);
    const mockChunkFileFetchResult: FetchResult = {
      code: FetchResultCode.Success,
      content: mockChunkFileBuffer
    };
    const mockChunkFileUri = 'MockChunkFileUri';

    // Generating provisional index file data.
    const mockProvisionalProofFileUri = undefined;
    const mockProvisionalIndexFileBuffer = await ProvisionalIndexFile.createBuffer(mockChunkFileUri, mockProvisionalProofFileUri, []);
    const mockProvisionalIndexFileUri = 'MockProvisionalIndexFileUri';
    const mockProvisionalIndexFileFetchResult: FetchResult = {
      code: FetchResultCode.Success,
      content: mockProvisionalIndexFileBuffer
    };

    // Generating core index file data.
    const mockCoreIndexFileBuffer =
      await CoreIndexFile.createBuffer('writerLock', mockProvisionalIndexFileUri, coreProofFileUri, createOperations, [], []);
    const mockAnchoredFileFetchResult: FetchResult = {
      code: FetchResultCode.Success,
      content: mockCoreIndexFileBuffer
    };
    const mockCoreIndexFileUri = 'MockCoreIndexFileUri';

    // Prepare the mock fetch results from the `DownloadManager.download()`.
    const mockDownloadFunction = async (hash: string) => {
      if (hash === mockCoreIndexFileUri) {
        return mockAnchoredFileFetchResult;
      } else if (hash === mockProvisionalIndexFileUri) {
        return mockProvisionalIndexFileFetchResult;
      } else if (hash === mockChunkFileUri) {
        return mockChunkFileFetchResult;
      } else {
        throw new Error('Test failed, unexpected hash given');
      }
    };
    spyOn(downloadManager, 'download').and.callFake(mockDownloadFunction);

    const blockchainClient = new Blockchain(config.blockchainServiceUri);
    const observer = new Observer(
      versionManager,
      blockchainClient,
      config.maxConcurrentDownloads,
      operationStore,
      transactionStore,
      transactionStore,
      1
    );

    const anchoredData = AnchoredDataSerializer.serialize({ coreIndexFileUri: mockCoreIndexFileUri, numberOfOperations: createOperations.length });
    const mockTransaction: TransactionModel = {
      transactionNumber: 1,
      transactionTime: 1000000,
      transactionTimeHash: '1000',
      anchorString: anchoredData,
      transactionFeePaid: 1,
      normalizedTransactionFee: 1,
      writer: 'writer'
    };
    const transactionUnderProcessing = {
      transaction: mockTransaction,
      processingStatus: 'pending'
    };
    await (observer as any).processTransaction(mockTransaction, transactionUnderProcessing);

    const didUniqueSuffixes = createOperations.map(operation => operation.didUniqueSuffix);
    for (const didUniqueSuffix of didUniqueSuffixes) {
      const operationArray = await operationStore.get(didUniqueSuffix);
      expect(operationArray.length).toEqual(1);
    }
  });

  // Testing invalid core index file scenarios:
  const invalidCoreIndexFileTestsInput = [
    [FetchResultCode.MaxSizeExceeded, 'exceeded max size limit'],
    [FetchResultCode.NotAFile, 'is not a file'],
    [FetchResultCode.InvalidHash, 'is not a valid hash']
  ];
  for (const tuple of invalidCoreIndexFileTestsInput) {
    const mockFetchReturnCode = tuple[0];
    const expectedConsoleLogSubstring = tuple[1];

    it(`should stop processing a transaction if downloading core index files returns '${mockFetchReturnCode}'.`, async () => {
      const blockchainClient = new Blockchain(config.blockchainServiceUri);
      const observer = new Observer(
        versionManager,
        blockchainClient,
        config.maxConcurrentDownloads,
        operationStore,
        transactionStore,
        transactionStore,
        1
      );

      spyOn(downloadManager, 'download').and.returnValue(Promise.resolve({ code: mockFetchReturnCode as FetchResultCode }));

      let expectedConsoleLogDetected = false;
      spyOn(Logger, 'info').and.callFake((message: string) => {
        if (message.includes(expectedConsoleLogSubstring)) {
          expectedConsoleLogDetected = true;
        }
      });

      spyOn(transactionStore, 'removeUnresolvableTransaction');
      spyOn(transactionStore, 'recordUnresolvableTransactionFetchAttempt');

      const anchoredData = AnchoredDataSerializer.serialize({ coreIndexFileUri: 'EiA_psBVqsuGjoYXMIRrcW_mPUG1yDXbh84VPXOuVQ5oqw', numberOfOperations: 1 });
      const mockTransaction: TransactionModel = {
        transactionNumber: 1,
        transactionTime: 1000000,
        transactionTimeHash: '1000',
        anchorString: anchoredData,
        transactionFeePaid: 1,
        normalizedTransactionFee: 1,
        writer: 'writer'
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
      moreTransactions: false,
      transactions: [
        {
          transactionNumber: 1,
          transactionTime: 1000,
          transactionTimeHash: '1000',
          anchorString: '1stTransaction',
          transactionFeePaid: 1,
          normalizedTransactionFee: 1,
          writer: 'writer1'
        },
        {
          transactionNumber: 2,
          transactionTime: 2000,
          transactionTimeHash: '2000',
          anchorString: '2ndTransaction',
          transactionFeePaid: 1,
          normalizedTransactionFee: 1,
          writer: 'writer2'
        },
        {
          transactionNumber: 3,
          transactionTime: 3000,
          transactionTimeHash: '3000',
          anchorString: '3rdTransaction',
          transactionFeePaid: 1,
          normalizedTransactionFee: 1,
          writer: 'writer3'
        }
      ]
    };

    const transactionFetchResponseBodyAfterBlockReorg = {
      moreTransactions: false,
      transactions: [
        {
          transactionNumber: 2,
          transactionTime: 2001,
          transactionTimeHash: '2001',
          anchorString: '2ndTransactionNew',
          transactionFeePaid: 1,
          normalizedTransactionFee: 1,
          writer: 'writer1'
        },
        {
          transactionNumber: 3,
          transactionTime: 3001,
          transactionTimeHash: '3000',
          anchorString: '3rdTransactionNew',
          transactionFeePaid: 1,
          normalizedTransactionFee: 1,
          writer: 'writer2'
        },
        {
          transactionNumber: 4,
          transactionTime: 4000,
          transactionTimeHash: '4000',
          anchorString: '4thTransaction',
          transactionFeePaid: 1,
          normalizedTransactionFee: 1,
          writer: 'writer3'
        }
      ]
    };
    const subsequentTransactionFetchResponseBody = {
      moreTransactions: false,
      transactions: []
    };

    const blockchainClient = new Blockchain(config.blockchainServiceUri);

    // Force blockchain time to be higher than the latest known transaction time by core,
    // such that Observer will consider `InvalidTransactionNumberOrTimeHash` a block reorg.
    (blockchainClient as any).cachedBlockchainTime = { time: 5000, hash: '5000' };

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

    // Make the `getFirstValidTransaction` call return the first transaction as the most recent known valid transactions.
    spyOn(blockchainClient, 'getFirstValidTransaction').and.returnValue(Promise.resolve(initialTransactionFetchResponseBody.transactions[0]));

    // Process first set of transactions.
    const observer = new Observer(
      versionManager,
      blockchainClient,
      config.maxConcurrentDownloads,
      operationStore,
      transactionStore,
      transactionStore,
      1
    );

    // mocking throughput limiter to make testing easier
    spyOn(observer['throughputLimiter'], 'getQualifiedTransactions').and.callFake(
      (transactions: TransactionModel[]) => {
        return new Promise((resolve) => { resolve(transactions); });
      }
    );

    await observer.startPeriodicProcessing(); // Asynchronously triggers Observer to start processing transactions immediately.

    // Monitor the processed transactions list until the expected count or max retries is reached.
    const processedTransactions = transactionStore.getTransactions();
    await retry(async _bail => {
      const processedTransactionCount = processedTransactions.length;
      if (processedTransactionCount === 4) {
        return;
      }

      // NOTE: the `retry` library retries if error is thrown.
      throw new Error('Block reorganization not handled.');
    }, {
      retries: 10,
      minTimeout: 1000, // milliseconds
      maxTimeout: 1000 // milliseconds
    });

    expect(processedTransactions.length).toEqual(4);
    expect(processedTransactions[0].anchorString).toEqual('1stTransaction');
    expect(processedTransactions[1].anchorString).toEqual('2ndTransactionNew');
    expect(processedTransactions[2].anchorString).toEqual('3rdTransactionNew');
    expect(processedTransactions[3].anchorString).toEqual('4thTransaction');
  });

  it('should not rollback if blockchain time in bitcoin service is behind core service.', async () => {
    const anchoredData = AnchoredDataSerializer.serialize({ coreIndexFileUri: '1stTransaction', numberOfOperations: 1 });
    const transaction = {
      transactionNumber: 1,
      transactionTime: 1000,
      transactionTimeHash: '1000',
      anchorString: anchoredData,
      transactionFeePaid: 1,
      normalizedTransactionFee: 1,
      writer: 'writer'
    };

    // Prep the transaction store with some initial state.
    await transactionStore.addTransaction(transaction);

    const blockchainClient = new Blockchain(config.blockchainServiceUri);

    // Always return a blockchain time less than the last transaction known by core to simulate blockchain service being behind core service.
    spyOn(blockchainClient, 'getLatestTime').and.returnValue(Promise.resolve({ time: 500, hash: '500' }));

    // Simulate the read response when blockchain service blockchain time is behind core service's.
    let readInvocationCount = 0;
    const mockReadFunction = async (sinceTransactionNumber?: number, transactionTimeHash?: string) => {
      readInvocationCount++;
      expect(sinceTransactionNumber).toEqual(1);
      expect(transactionTimeHash).toEqual('1000');
      throw new SidetreeError(ErrorCode.InvalidTransactionNumberOrTimeHash);
    };
    spyOn(blockchainClient, 'read').and.callFake(mockReadFunction);

    // NOTE: it is irrelevant what getFirstValidTransaction() returns because it is expected to be not called at all.
    const getFirstValidTransactionSpy =
      spyOn(blockchainClient, 'getFirstValidTransaction').and.returnValue(Promise.resolve(undefined));

    // Process first set of transactions.
    const observer = new Observer(
      versionManager,
      blockchainClient,
      config.maxConcurrentDownloads,
      operationStore,
      transactionStore,
      transactionStore,
      1
    );

    const revertInvalidTransactionsSpy = spyOn(observer as any, 'revertInvalidTransactions').and.returnValue(Promise.resolve(undefined));

    await observer.startPeriodicProcessing(); // Asynchronously triggers Observer to start processing transactions immediately.

    // Monitor the Observer until at two processing cycle has lapsed.
    await retry(async _bail => {
      if (readInvocationCount >= 2) {
        return;
      }

      // NOTE: the `retry` library retries if error is thrown.
      throw new Error('Two transaction processing cycles have not occurred yet.');
    }, {
      retries: 3,
      minTimeout: 1000, // milliseconds
      maxTimeout: 1000 // milliseconds
    });

    expect(revertInvalidTransactionsSpy).toHaveBeenCalledTimes(0);
    expect(getFirstValidTransactionSpy).toHaveBeenCalledTimes(0);
  });

  describe('waitUntilCountOfTransactionsUnderProcessingIsLessOrEqualTo', () => {
    it('should wait until transactionsUnderProcessing is greater than count', async () => {
      const blockchainClient = new Blockchain(config.blockchainServiceUri);
      const observer = new Observer(
        versionManager,
        blockchainClient,
        config.maxConcurrentDownloads,
        operationStore,
        transactionStore,
        transactionStore,
        1
      );
      observer['transactionsUnderProcessing'] = [1, 2, 3] as any;
      const storeConsecutiveTransactionsProcessedSpy = spyOn(observer as any, 'storeConsecutiveTransactionsProcessed').and.callFake(() => {
        observer['transactionsUnderProcessing'] = [];
      });

      const startTime = Date.now();
      await observer['waitUntilCountOfTransactionsUnderProcessingIsLessOrEqualTo'](0);
      const endTime = Date.now();

      expect(storeConsecutiveTransactionsProcessedSpy).toHaveBeenCalledTimes(1);
      // it should have taken at least 1 second because the setTimeout loop
      expect(endTime - startTime).toBeGreaterThanOrEqual(1000);
    });
  });

  describe('processUnresolvableTransactions', () => {
    it('should process unresolvable transactions as expected', async () => {
      const blockchainClient = new Blockchain(config.blockchainServiceUri);
      const observer = new Observer(
        versionManager,
        blockchainClient,
        config.maxConcurrentDownloads,
        operationStore,
        transactionStore,
        transactionStore,
        1
      );
      const isIndividualResolved = [false, false, false];
      spyOn(observer['unresolvableTransactionStore'], 'getUnresolvableTransactionsDueForRetry').and.returnValue([1, 2, 3] as any);

      spyOn(observer as any, 'processTransaction').and.callFake((transaction: any, awaitingTransaction: any) => {
        awaitingTransaction.processingStatus = TransactionProcessingStatus.Processed;
        isIndividualResolved[transaction - 1] = true;
      });

      await observer['processUnresolvableTransactions']();
      expect(isIndividualResolved[0]).toBeTruthy();
      expect(isIndividualResolved[1]).toBeTruthy();
      expect(isIndividualResolved[2]).toBeTruthy();
    });
  });

  describe('processTransaction', () => {
    it('should handle unexpected error', async () => {
      const blockchainClient = new Blockchain(config.blockchainServiceUri);
      const observer = new Observer(
        versionManager,
        blockchainClient,
        config.maxConcurrentDownloads,
        operationStore,
        transactionStore,
        transactionStore,
        1
      );
      getTransactionProcessorSpy.and.throwError('Expected test error');
      const recordUnresolvableAttemptSpy = spyOn(observer['unresolvableTransactionStore'], 'recordUnresolvableTransactionFetchAttempt');

      await observer['processTransaction']({} as any, {} as any);
      // Failed to process the unresolvable transactions so the attempt should be recorded
      expect(recordUnresolvableAttemptSpy).toHaveBeenCalled();
    });
  });
});

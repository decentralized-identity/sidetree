import * as retry from 'async-retry';
import AnchoredDataSerializer from '../../lib/core/versions/latest/AnchoredDataSerializer';
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
import IVersionManager from '../../lib/core/interfaces/IVersionManager';
import KeyUsage from '../../lib/core/versions/latest/KeyUsage';
import MockOperationStore from '../mocks/MockOperationStore';
import MockTransactionStore from '../mocks/MockTransactionStore';
import MockVersionManager from '../mocks/MockVersionManager';
import Multihash from '../../lib/core/versions/latest/Multihash';
import Observer from '../../lib/core/Observer';
import Operation from '../../lib/core/versions/latest/Operation';
import OperationGenerator from '../generators/OperationGenerator';
import ThroughputLimiter from '../../lib/core/versions/latest/ThroughputLimiter';
import TransactionModel from '../../lib/common/models/TransactionModel';
import TransactionProcessor from '../../lib/core/versions/latest/TransactionProcessor';
import { FetchResultCode } from '../../lib/common/FetchResultCode';
import { SidetreeError } from '../../lib/core/Error';

describe('Observer', async () => {
  const config = require('../json/config-test.json');

  let casClient;
  let downloadManager: DownloadManager;
  let operationStore: IOperationStore;
  let transactionStore: MockTransactionStore;
  let versionManager: IVersionManager;

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

    const transactionProcessor = new TransactionProcessor(downloadManager, operationStore);
    const throughputLimiter = new ThroughputLimiter(10, 25, transactionStore);
    versionManager = new MockVersionManager();

    spyOn(versionManager, 'getTransactionProcessor').and.returnValue(transactionProcessor);
    spyOn(versionManager, 'getThroughputLimiter').and.returnValue(throughputLimiter);
  });

  afterAll(() => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = originalDefaultTestTimeout;
  });

  beforeEach(() => {
    transactionStore = new MockTransactionStore();
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
          'anchorString': AnchoredDataSerializer.serialize({
            anchorFileHash: 'hash1',
            numberOfOperations: 1
          }),
          'transactionFeePaid': 1,
          'normalizedTransactionFee': 1
        },
        {
          'transactionNumber': 2,
          'transactionTime': 1001,
          'transactionTimeHash': '1000',
          'anchorString': AnchoredDataSerializer.serialize({
            anchorFileHash: 'hash2',
            numberOfOperations: 1
          }),
          'transactionFeePaid': 2,
          'normalizedTransactionFee': 2
        },
        {
          'transactionNumber': 3,
          'transactionTime': 1111,
          'transactionTimeHash': '1000',
          'anchorString': AnchoredDataSerializer.serialize({
            anchorFileHash: 'Force previous to process',
            numberOfOperations: 1
          }),
          'transactionFeePaid': 2,
          'normalizedTransactionFee': 2
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
      versionManager,
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

    expect(processedTransactions[0].anchorString).toEqual('AQAAAA.hash1');
    expect(processedTransactions[1].anchorString).toEqual('AQAAAA.hash2');
  });

  it('should process a valid operation batch successfully.', async () => {
    // Prepare the mock response from the DownloadManager.
    const [recoveryPublicKey, recoveryPrivateKey] = await Cryptography.generateKeyPairHex('#key1', KeyUsage.recovery);
    const [signingPublicKey] = await Cryptography.generateKeyPairHex('#key2', KeyUsage.signing);
    const services = OperationGenerator.createIdentityHubUserServiceEndpoints(['did:sidetree:value0']);

    const [recoveryPublicKey2, recoveryPrivateKey2] = await Cryptography.generateKeyPairHex('#key3', KeyUsage.recovery);
    const [signingPublicKey2] = await Cryptography.generateKeyPairHex('#key4', KeyUsage.signing);

    const [, nextRecoveryOtpHash] = OperationGenerator.generateOtp();
    const [, nextUpdateOtpHash] = OperationGenerator.generateOtp();

    const operationsBuffer = [
      await OperationGenerator.generateCreateOperationBuffer(
        recoveryPublicKey,
        recoveryPrivateKey,
        signingPublicKey,
        nextRecoveryOtpHash,
        nextUpdateOtpHash,
        services),
      await OperationGenerator.generateCreateOperationBuffer(
        recoveryPublicKey2,
        recoveryPrivateKey2,
        signingPublicKey2,
        nextRecoveryOtpHash,
        nextUpdateOtpHash,
        services)
    ];

    const batchFileBuffer = await BatchFile.fromOperationBuffers(operationsBuffer);

    const batchFileFetchResult: FetchResult = {
      code: FetchResultCode.Success,
      content: batchFileBuffer
    };

    const batchFilehash = Encoder.encode(Multihash.hash(batchFileBuffer, 18));

    const operationDids = operationsBuffer.map((op) => { return Operation.create(op).didUniqueSuffix; });
    const anchorFile: AnchorFileModel = {
      batchFileHash: batchFilehash,
      didUniqueSuffixes: operationDids
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
      versionManager,
      blockchainClient,
      config.maxConcurrentDownloads,
      operationStore,
      transactionStore,
      transactionStore,
      1
    );

    const anchoredData = AnchoredDataSerializer.serialize({ anchorFileHash: anchorFilehash, numberOfOperations: 1 });
    const mockTransaction: TransactionModel = {
      transactionNumber: 1,
      transactionTime: 1000000,
      transactionTimeHash: '1000',
      anchorString: anchoredData,
      transactionFeePaid: 1,
      normalizedTransactionFee: 1
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
      spyOn(global.console, 'info').and.callFake((message: string) => {
        if (message.includes(expectedConsoleLogSubstring)) {
          expectedConsoleLogDetected = true;
        }
      });

      spyOn(transactionStore, 'removeUnresolvableTransaction');
      spyOn(transactionStore, 'recordUnresolvableTransactionFetchAttempt');

      const anchoredData = AnchoredDataSerializer.serialize({ anchorFileHash: 'EiA_psBVqsuGjoYXMIRrcW_mPUG1yDXbh84VPXOuVQ5oqw', numberOfOperations: 1 });
      const mockTransaction: TransactionModel = {
        transactionNumber: 1,
        transactionTime: 1000000,
        transactionTimeHash: '1000',
        anchorString: anchoredData,
        transactionFeePaid: 1,
        normalizedTransactionFee: 1
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
          'anchorString': AnchoredDataSerializer.serialize({
            anchorFileHash: 'hash1',
            numberOfOperations: 1
          }),
          'transactionFeePaid': 1,
          'normalizedTransactionFee': 1
        },
        {
          'transactionNumber': 2,
          'transactionTime': 2000,
          'transactionTimeHash': '2000',
          'anchorString': AnchoredDataSerializer.serialize({
            anchorFileHash: 'hash2',
            numberOfOperations: 1
          }),
          'transactionFeePaid': 1,
          'normalizedTransactionFee': 1
        },
        {
          'transactionNumber': 3,
          'transactionTime': 3000,
          'transactionTimeHash': '3000',
          'anchorString': AnchoredDataSerializer.serialize({
            anchorFileHash: 'hash3',
            numberOfOperations: 1
          }),
          'transactionFeePaid': 1,
          'normalizedTransactionFee': 1
        },
        {
          'transactionNumber': 4,
          'transactionTime': 4000,
          'transactionTimeHash': '4000',
          'anchorString': AnchoredDataSerializer.serialize({
            anchorFileHash: 'This should be cut off and not processed',
            numberOfOperations: 1
          }),
          'transactionFeePaid': 1,
          'normalizedTransactionFee': 1
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
          'anchorString': AnchoredDataSerializer.serialize({
            anchorFileHash: 'hash2New',
            numberOfOperations: 1
          }),
          'transactionFeePaid': 1,
          'normalizedTransactionFee': 1
        },
        {
          'transactionNumber': 3,
          'transactionTime': 3001,
          'transactionTimeHash': '3000',
          'anchorString': AnchoredDataSerializer.serialize({
            anchorFileHash: 'hash3New',
            numberOfOperations: 1
          }),
          'transactionFeePaid': 1,
          'normalizedTransactionFee': 1
        },
        {
          'transactionNumber': 4,
          'transactionTime': 4000,
          'transactionTimeHash': '4000',
          'anchorString': AnchoredDataSerializer.serialize({
            anchorFileHash: 'hash4New',
            numberOfOperations: 1
          }),
          'transactionFeePaid': 1,
          'normalizedTransactionFee': 1
        },
        {
          'transactionNumber': 5,
          'transactionTime': 5000,
          'transactionTimeHash': '5000',
          'anchorString': AnchoredDataSerializer.serialize({
            anchorFileHash: 'This should be cutoff and not processed',
            numberOfOperations: 1
          }),
          'transactionFeePaid': 1,
          'normalizedTransactionFee': 1
        }
      ]
    };
    const subsequentTransactionFetchResponseBody = {
      'moreTransactions': false,
      'transactions': []
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

    // Make the `getFirstValidTransaction` call return the first transaction as the most recent knwon valid transactions.
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
    expect(processedTransactions[0].anchorString).toEqual('AQAAAA.hash1');
    expect(processedTransactions[1].anchorString).toEqual('AQAAAA.hash2New');
    expect(processedTransactions[2].anchorString).toEqual('AQAAAA.hash3New');
    expect(processedTransactions[3].anchorString).toEqual('AQAAAA.hash4New');
  });

  it('should not rollback if blockchain time in bitcoin service is behind core service.', async () => {
    const anchoredData = AnchoredDataSerializer.serialize({ anchorFileHash: '1stTransaction', numberOfOperations: 1 });
    const transaction = {
      'transactionNumber': 1,
      'transactionTime': 1000,
      'transactionTimeHash': '1000',
      'anchorString': anchoredData,
      'transactionFeePaid': 1,
      'normalizedTransactionFee': 1
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

    // NOTE: it is irrelvant what getFirstValidTransaction() returns because it is expected to be not called at all.
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
      throw new Error('Two transaction processing cycles have not occured yet.');
    }, {
      retries: 3,
      minTimeout: 1000, // milliseconds
      maxTimeout: 1000 // milliseconds
    });

    expect(revertInvalidTransactionsSpy).toHaveBeenCalledTimes(0);
    expect(getFirstValidTransactionSpy).toHaveBeenCalledTimes(0);
  });
});

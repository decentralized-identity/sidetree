import * as httpStatus from 'http-status';
import BitcoinBlockModel from '../../lib/bitcoin/models/BitcoinBlockModel';
import BitcoinClient from '../../lib/bitcoin/BitcoinClient';
import BitcoinDataGenerator from './BitcoinDataGenerator';
import BitcoinProcessor, { IBlockInfo } from '../../lib/bitcoin/BitcoinProcessor';
import BitcoinTransactionModel from '../../lib/bitcoin/models/BitcoinTransactionModel';
import IBitcoinConfig from '../../lib/bitcoin/IBitcoinConfig';
import ErrorCode from '../../lib/bitcoin/ErrorCode';
import RequestError from '../../lib/bitcoin/RequestError';
import ResponseStatus from '../../lib/common/enums/ResponseStatus';
import ServiceVersionModel from '../../lib/common/models/ServiceVersionModel';
import SidetreeError from '../../lib/common/SidetreeError';
import SidetreeTransactionModel from '../../lib/bitcoin/models/SidetreeTransactionModel';
import SharedErrorCode from '../../lib/common/SharedErrorCode';
import TransactionFeeModel from '../../lib/common/models/TransactionFeeModel';
import TransactionModel from '../../lib/common/models/TransactionModel';
import TransactionNumber from '../../lib/bitcoin/TransactionNumber';
import ValueTimeLockModel from '../../lib/common/models/ValueTimeLockModel';
import { Transaction } from 'bitcore-lib';

function randomString (length: number = 16): string {
  return Math.round(Math.random() * Number.MAX_SAFE_INTEGER).toString(16).substring(0, length);
}

function randomNumber (max: number = 256): number {
  return Math.round(Math.random() * max);
}

function randomBlock (above: number = 0): IBlockInfo {
  return { height: above + randomNumber(), hash: randomString(), previousHash: randomString() };
}

describe('BitcoinProcessor', () => {
  const testConfig: IBitcoinConfig = {
    bitcoinFeeSpendingCutoffPeriodInBlocks: 100,
    bitcoinFeeSpendingCutoff: 1,
    bitcoinPeerUri: 'http://localhost:18332',
    bitcoinRpcUsername: 'admin',
    bitcoinRpcPassword: '123456789',
    bitcoinWalletOrImportString: BitcoinClient.generatePrivateKey('testnet'),
    databaseName: 'bitcoin-test',
    requestTimeoutInMilliseconds: 300,
    genesisBlockNumber: 1480000,
    lowBalanceNoticeInDays: 28,
    requestMaxRetries: 3,
    mongoDbConnectionString: 'mongodb://localhost:27017',
    sidetreeTransactionPrefix: 'sidetree:',
    transactionPollPeriodInSeconds: 60,
    sidetreeTransactionFeeMarkupPercentage: 0,
    valueTimeLockPollPeriodInSeconds: 60,
    valueTimeLockAmountInBitcoins: 1,
    valueTimeLockTransactionFeesAmountInBitcoins: undefined
  };

  let bitcoinProcessor: BitcoinProcessor;
  let transactionStoreInitializeSpy: jasmine.Spy;
  let quantileCalculatorInitializeSpy: jasmine.Spy;
  let bitcoinClientInitializeSpy: jasmine.Spy;
  let transactionStoreLatestTransactionSpy: jasmine.Spy;
  let getStartingBlockForInitializationSpy: jasmine.Spy;
  let processTransactionsSpy: jasmine.Spy;
  let periodicPollSpy: jasmine.Spy;
  let mongoLockTxnStoreSpy: jasmine.Spy;
  let lockMonitorSpy: jasmine.Spy;

  beforeEach(() => {
    bitcoinProcessor = new BitcoinProcessor(testConfig);
    transactionStoreInitializeSpy = spyOn(bitcoinProcessor['transactionStore'], 'initialize');
    quantileCalculatorInitializeSpy = spyOn(bitcoinProcessor['quantileCalculator'], 'initialize');
    bitcoinClientInitializeSpy = spyOn(bitcoinProcessor['bitcoinClient'], 'initialize');
    mongoLockTxnStoreSpy = spyOn(bitcoinProcessor['mongoDbLockTransactionStore'], 'initialize');
    lockMonitorSpy = spyOn(bitcoinProcessor['lockMonitor'], 'initialize');

    transactionStoreLatestTransactionSpy = spyOn(bitcoinProcessor['transactionStore'], 'getLastTransaction');
    transactionStoreLatestTransactionSpy.and.returnValue(Promise.resolve(undefined));

    getStartingBlockForInitializationSpy = spyOn(bitcoinProcessor as any, 'getStartingBlockForInitialization');
    getStartingBlockForInitializationSpy.and.returnValue(Promise.resolve(undefined));

    processTransactionsSpy = spyOn(bitcoinProcessor, 'processTransactions' as any);
    processTransactionsSpy.and.returnValue(Promise.resolve({ hash: 'IamAHash', height: 54321 }));
    periodicPollSpy = spyOn(bitcoinProcessor, 'periodicPoll' as any);
  });

  function createTransactions (count?: number, height?: number, incrementalHeight = false): TransactionModel[] {
    const transactions: TransactionModel[] = [];
    if (!count) {
      count = randomNumber(9) + 1;
    }
    if (height === undefined) {
      height = randomNumber();
    }
    const hash = randomString();
    const feePaidRandom = randomNumber();

    for (let i = 0; i < count; i++) {
      transactions.push({
        transactionNumber: TransactionNumber.construct(height, i),
        transactionTime: incrementalHeight ? height + i : height,
        transactionTimeHash: hash,
        anchorString: randomString(),
        transactionFeePaid: feePaidRandom,
        normalizedTransactionFee: feePaidRandom,
        writer: randomString()
      });
    }
    return transactions;
  }

  describe('constructor', () => {
    it('should use appropriate config values', () => {
      const config: IBitcoinConfig = {
        bitcoinFeeSpendingCutoffPeriodInBlocks: 100,
        bitcoinFeeSpendingCutoff: 1,
        bitcoinPeerUri: randomString(),
        bitcoinRpcUsername: 'admin',
        bitcoinRpcPassword: 'password123',
        bitcoinWalletOrImportString: BitcoinClient.generatePrivateKey('testnet'),
        databaseName: randomString(),
        genesisBlockNumber: randomNumber(),
        mongoDbConnectionString: randomString(),
        sidetreeTransactionPrefix: randomString(4),
        lowBalanceNoticeInDays: undefined,
        requestTimeoutInMilliseconds: undefined,
        requestMaxRetries: undefined,
        transactionPollPeriodInSeconds: undefined,
        sidetreeTransactionFeeMarkupPercentage: 0,
        valueTimeLockPollPeriodInSeconds: 60,
        valueTimeLockAmountInBitcoins: 1,
        valueTimeLockTransactionFeesAmountInBitcoins: undefined
      };

      const bitcoinProcessor = new BitcoinProcessor(config);
      expect(bitcoinProcessor.genesisBlockNumber).toEqual(config.genesisBlockNumber);
      expect(bitcoinProcessor.lowBalanceNoticeDays).toEqual(28);
      expect(bitcoinProcessor.pollPeriod).toEqual(60);
      expect(bitcoinProcessor.sidetreePrefix).toEqual(config.sidetreeTransactionPrefix);
      expect(bitcoinProcessor['transactionStore'].databaseName).toEqual(config.databaseName!);
      expect(bitcoinProcessor['transactionStore']['serverUrl']).toEqual(config.mongoDbConnectionString);
      expect(bitcoinProcessor['bitcoinClient']['sidetreeTransactionFeeMarkupPercentage']).toEqual(0);
    });
  });

  describe('initialize', () => {

    beforeEach(async () => {
      quantileCalculatorInitializeSpy.and.returnValue(Promise.resolve(undefined));
      bitcoinClientInitializeSpy.and.returnValue(Promise.resolve());
      getStartingBlockForInitializationSpy.and.returnValue(Promise.resolve({ height: 123, hash: 'hash' }));
      mongoLockTxnStoreSpy.and.returnValue(Promise.resolve());
      lockMonitorSpy.and.returnValue(Promise.resolve());
    });

    it('should initialize the internal objects', async (done) => {
      expect(transactionStoreInitializeSpy).not.toHaveBeenCalled();
      expect(quantileCalculatorInitializeSpy).not.toHaveBeenCalled();
      expect(bitcoinClientInitializeSpy).not.toHaveBeenCalled();
      expect(mongoLockTxnStoreSpy).not.toHaveBeenCalled();
      expect(lockMonitorSpy).not.toHaveBeenCalled();

      await bitcoinProcessor.initialize();

      expect(transactionStoreInitializeSpy).toHaveBeenCalled();
      expect(quantileCalculatorInitializeSpy).toHaveBeenCalledWith();
      expect(bitcoinClientInitializeSpy).toHaveBeenCalled();
      expect(mongoLockTxnStoreSpy).toHaveBeenCalled();
      expect(lockMonitorSpy).toHaveBeenCalled();
      done();
    });

    it('should process all the blocks since its last known', async (done) => {
      const fromNumber = randomNumber();
      const fromHash = randomString();

      getStartingBlockForInitializationSpy.and.returnValue(
        Promise.resolve({
          height: fromNumber,
          hash: fromHash
        })
      );

      processTransactionsSpy.and.callFake((sinceBlock: IBlockInfo) => {
        expect(sinceBlock.height).toEqual(fromNumber);
        expect(sinceBlock.hash).toEqual(fromHash);
        return Promise.resolve({
          hash: 'latestHash',
          height: 12345
        });
      });
      expect(getStartingBlockForInitializationSpy).not.toHaveBeenCalled();
      expect(processTransactionsSpy).not.toHaveBeenCalled();
      await bitcoinProcessor.initialize();
      expect(getStartingBlockForInitializationSpy).toHaveBeenCalled();
      expect(processTransactionsSpy).toHaveBeenCalled();
      done();
    });

    it('should begin to periodically poll for updates', async (done) => {
      expect(periodicPollSpy).not.toHaveBeenCalled();
      await bitcoinProcessor.initialize();
      expect(periodicPollSpy).toHaveBeenCalled();
      done();
    });
  });

  describe('time', () => {
    it('should get the current latest when given no hash', async (done) => {
      const height = randomNumber();
      const hash = randomString();
      const tipSpy = spyOn(bitcoinProcessor['bitcoinClient'], 'getCurrentBlockHeight' as any).and.returnValue(Promise.resolve(height));
      const hashSpy = spyOn(bitcoinProcessor['bitcoinClient'], 'getBlockHash' as any).and.returnValue(Promise.resolve(hash));
      const spy = spyOn(bitcoinProcessor['bitcoinClient'], 'getBlockInfo');
      const actual = await bitcoinProcessor.time();
      expect(actual.time).toEqual(height);
      expect(actual.hash).toEqual(hash);
      expect(tipSpy).toHaveBeenCalled();
      expect(hashSpy).toHaveBeenCalled();
      expect(spy).not.toHaveBeenCalled();
      done();
    });

    it('should get the corresponding bitcoin height given a hash', async (done) => {
      const height = randomNumber();
      const hash = randomString();

      const tipSpy = spyOn(bitcoinProcessor['bitcoinClient'], 'getCurrentBlockHeight' as any).and.returnValue(Promise.resolve(height));
      const hashSpy = spyOn(bitcoinProcessor['bitcoinClient'], 'getBlockHash' as any).and.returnValue(Promise.resolve(hash));
      const spy = spyOn(bitcoinProcessor['bitcoinClient'], 'getBlockInfo');
      spy.and.returnValue(Promise.resolve({ height, hash, previousHash: 'prevHash' }));

      const actual = await bitcoinProcessor.time(hash);
      expect(actual.time).toEqual(height);
      expect(actual.hash).toEqual(hash);
      expect(tipSpy).not.toHaveBeenCalled();
      expect(hashSpy).not.toHaveBeenCalled();
      expect(spy).toHaveBeenCalled();
      done();
    });
  });

  describe('transactions', () => {
    it('should get transactions since genesis capped by page size in blocks', async (done) => {
      const verifyMock = spyOn(bitcoinProcessor, 'verifyBlock' as any).and.returnValue(Promise.resolve(true));
      bitcoinProcessor['lastProcessedBlock'] = {
        height: Number.MAX_SAFE_INTEGER,
        hash: 'some hash',
        previousHash: 'previous hash'
      };
      // return as many as page size
      const transactions: TransactionModel[] = createTransactions(BitcoinProcessor['pageSizeInBlocks'], bitcoinProcessor['genesisBlockNumber'], true);
      const laterThanMock = spyOn(bitcoinProcessor['transactionStore'], 'getTransactionsStartingFrom').and.callFake((() => {
        return Promise.resolve(transactions);
      }));

      const actual = await bitcoinProcessor.transactions();
      expect(verifyMock).toHaveBeenCalledTimes(1); // called after data was retrieved
      expect(laterThanMock).toHaveBeenCalled();
      expect(actual.moreTransactions).toBeTruthy(); // true because page size is reached
      expect(actual.transactions).toEqual(transactions);
      done();
    });

    it('should get transactions since genesis and handle mid block processing', async (done) => {
      const verifyMock = spyOn(bitcoinProcessor, 'verifyBlock' as any).and.returnValue(Promise.resolve(true));
      const transactions = createTransactions(BitcoinProcessor['pageSizeInBlocks'], bitcoinProcessor['genesisBlockNumber'], true);
      // This makes the last transaction in the array "processing"
      const lastProcessedBlockHeightLess = transactions[transactions.length - 1].transactionTime - 1;
      bitcoinProcessor['lastProcessedBlock'] = {
        height: lastProcessedBlockHeightLess,
        hash: 'some hash',
        previousHash: 'previous hash'
      };
      const laterThanMock = spyOn(bitcoinProcessor['transactionStore'], 'getTransactionsStartingFrom').and.callFake((() => {
        return Promise.resolve(transactions);
      }));

      const actual = await bitcoinProcessor.transactions();
      expect(verifyMock).toHaveBeenCalledTimes(1);
      expect(laterThanMock).toHaveBeenCalled();
      expect(actual.moreTransactions).toBeFalsy(); // don't need more transactions because page size is not reached (last block reached)
      expect(actual.transactions).toEqual(transactions.slice(0, transactions.length - 1)); // the last one should be omitted because it is processing
      done();
    });

    it('should get transactions since genesis and handle complete last block', async (done) => {
      const verifyMock = spyOn(bitcoinProcessor, 'verifyBlock' as any).and.returnValue(Promise.resolve(true));
      const transactions = createTransactions(BitcoinProcessor['pageSizeInBlocks'], bitcoinProcessor['genesisBlockNumber'], true);
      // make the last transaction time to be the same as last processed block height
      const lastProcessedBlockHeight = transactions[transactions.length - 1].transactionTime;
      bitcoinProcessor['lastProcessedBlock'] = {
        height: lastProcessedBlockHeight,
        hash: 'some hash',
        previousHash: 'previous hash'
      };
      const laterThanMock = spyOn(bitcoinProcessor['transactionStore'], 'getTransactionsStartingFrom').and.callFake((() => {
        return Promise.resolve(transactions);
      }));

      const actual = await bitcoinProcessor.transactions();
      expect(verifyMock).toHaveBeenCalledTimes(1);
      expect(laterThanMock).toHaveBeenCalled();
      expect(actual.moreTransactions).toBeTruthy();
      expect(actual.transactions).toEqual(transactions);
      done();
    });

    it('should get transactions since genesis and handle past last block', async (done) => {
      const verifyMock = spyOn(bitcoinProcessor, 'verifyBlock' as any).and.returnValue(Promise.resolve(true));
      const lastProcessedBlockHeight = bitcoinProcessor['genesisBlockNumber'];
      const transactions = createTransactions(BitcoinProcessor['pageSizeInBlocks'], lastProcessedBlockHeight + 1, false);
      // make the last transaction time genesis so the transactions will all be out of bound
      bitcoinProcessor['lastProcessedBlock'] = {
        height: lastProcessedBlockHeight,
        hash: 'some hash',
        previousHash: 'previous hash'
      };
      const laterThanMock = spyOn(bitcoinProcessor['transactionStore'], 'getTransactionsStartingFrom').and.callFake((() => {
        return Promise.resolve(transactions);
      }));

      const actual = await bitcoinProcessor.transactions();
      expect(verifyMock).toHaveBeenCalledTimes(1);
      expect(laterThanMock).toHaveBeenCalled();
      expect(actual.moreTransactions).toBeFalsy(); // no more transactions because past last block
      expect(actual.transactions).toEqual([]); // no return because nothing is processed
      done();
    });

    it('should group transactions correctly by transaction time', async (done) => {
      const verifyMock = spyOn(bitcoinProcessor, 'verifyBlock' as any).and.returnValue(Promise.resolve(true));
      // make the last transaction time genesis + 100 so it needs to call getTransactionsStartingFrom multiple times
      const lastProcessedBlockHeight = bitcoinProcessor['genesisBlockNumber'] + 100;
      bitcoinProcessor['lastProcessedBlock'] = {
        height: lastProcessedBlockHeight,
        hash: 'some hash',
        previousHash: 'previous hash'
      };
      const laterThanMock = spyOn(bitcoinProcessor['transactionStore'], 'getTransactionsStartingFrom').and.callFake(((begin) => {
        return Promise.resolve(createTransactions(10, begin, false));
      }));

      const actual = await bitcoinProcessor.transactions();
      expect(verifyMock).toHaveBeenCalledTimes(1);
      expect(laterThanMock).toHaveBeenCalled();
      expect(actual.moreTransactions).toBeTruthy(); // more transactions because last block returned is 90
      expect(actual.transactions.length).toEqual(100); // 100 because 10 per query and called 10 times
      expect(actual.transactions[99].transactionTime).toEqual(bitcoinProcessor['genesisBlockNumber'] + 90);
      expect(actual.transactions[0].transactionTime).toEqual(bitcoinProcessor['genesisBlockNumber']);
      done();
    });

    it('should return default if transactions is empty array', async (done) => {
      const verifyMock = spyOn(bitcoinProcessor, 'verifyBlock' as any).and.returnValue(Promise.resolve(true));
      bitcoinProcessor['lastProcessedBlock'] = {
        height: bitcoinProcessor['genesisBlockNumber'] + 99999, // loop past this number and get nothing
        hash: 'some hash',
        previousHash: 'previous hash'
      };
      const laterThanMock = spyOn(bitcoinProcessor['transactionStore'], 'getTransactionsStartingFrom').and.callFake((() => {
        return Promise.resolve([]);
      }));

      const actual = await bitcoinProcessor.transactions();
      expect(verifyMock).toHaveBeenCalledTimes(1);
      expect(laterThanMock).toHaveBeenCalled();
      expect(actual.moreTransactions).toBeFalsy();
      expect(actual.transactions).toEqual([]);
      done();
    });

    it('should get transactions since a specific block height and hash', async (done) => {
      const expectedHeight = randomNumber();
      const expectedHash = randomString();
      const expectedTransactionNumber = TransactionNumber.construct(expectedHeight, 0);
      const lastBlockHeight = BitcoinProcessor['pageSizeInBlocks'] + expectedHeight - 1; // caps the result to avoid 2 sets of transactions
      const lastBlockHash = 'last block hash';
      bitcoinProcessor['lastProcessedBlock'] = {
        height: lastBlockHeight,
        hash: lastBlockHash,
        previousHash: 'previous hash'
      };
      const verifyMock = spyOn(bitcoinProcessor, 'verifyBlock' as any).and.callFake((height: number, hash: string) => {
        expect(height === expectedHeight || height === lastBlockHeight).toBeTruthy();
        expect(hash === expectedHash || hash === lastBlockHash).toBeTruthy();
        return Promise.resolve(true);
      });
      const transactions = createTransactions(BitcoinProcessor['pageSizeInBlocks'], expectedHeight, true);
      const laterThanMock = spyOn(bitcoinProcessor['transactionStore'], 'getTransactionsStartingFrom').and.callFake((() => {
        return Promise.resolve(transactions);
      }));

      const actual = await bitcoinProcessor.transactions(expectedTransactionNumber, expectedHash);
      expect(verifyMock).toHaveBeenCalledTimes(2);
      expect(laterThanMock).toHaveBeenCalled();
      expect(actual.moreTransactions).toBeFalsy();
      transactions.shift();
      expect(actual.transactions).toEqual(transactions); // the first one should be excluded because of since
      done();
    });

    it('should fail if only given a block height', async (done) => {
      try {
        await bitcoinProcessor.transactions(randomNumber());
        fail('expected to throw');
      } catch (error) {
        expect(error.status).toEqual(httpStatus.BAD_REQUEST);
        expect(error.code).not.toEqual(SharedErrorCode.InvalidTransactionNumberOrTimeHash);
      } finally {
        done();
      }
    });

    it('should fail if the height and hash do not validate against the current blockchain', async (done) => {
      const expectedHeight = randomNumber();
      const expectedHash = randomString();
      const expectedTransactionNumber = TransactionNumber.construct(expectedHeight, 0);
      const verifyMock = spyOn(bitcoinProcessor, 'verifyBlock' as any).and.returnValue(Promise.resolve(false));
      try {
        await bitcoinProcessor.transactions(expectedTransactionNumber, expectedHash);
        fail('expected to throw');
      } catch (error) {
        expect(error.status).toEqual(httpStatus.BAD_REQUEST);
        expect(error.code).toEqual(SharedErrorCode.InvalidTransactionNumberOrTimeHash);
        expect(verifyMock).toHaveBeenCalledTimes(1);
      } finally {
        done();
      }
    });

    it('should fail if verifyBlock fails after transactionStore query', async (done) => {
      const expectedHeight = randomNumber();
      const expectedHash = randomString();
      const expectedTransactionNumber = TransactionNumber.construct(expectedHeight, 0);
      const verifyMock = spyOn(bitcoinProcessor, 'verifyBlock' as any).and.returnValues(Promise.resolve(true), Promise.resolve(false));
      const getTransactionsSinceMock = spyOn(bitcoinProcessor, 'getTransactionsSince' as any).and.returnValue([[], 0]);
      bitcoinProcessor['lastProcessedBlock'] = {
        height: 1234,
        hash: 'some hash',
        previousHash: 'previous hash'
      };
      try {
        await bitcoinProcessor.transactions(expectedTransactionNumber, expectedHash);
        fail('expected to throw');
      } catch (error) {
        expect(error.status).toEqual(httpStatus.BAD_REQUEST);
        expect(error.code).toEqual(SharedErrorCode.InvalidTransactionNumberOrTimeHash);
        expect(getTransactionsSinceMock).toHaveBeenCalled();
        expect(verifyMock).toHaveBeenCalledTimes(2);
      } finally {
        done();
      }
    });

    it('should make moreTransactions true when last block processed is not reached', async (done) => {
      bitcoinProcessor['lastProcessedBlock'] = {
        height: Number.MAX_SAFE_INTEGER, // this is unreachable
        hash: 'some hash',
        previousHash: 'previous hash'
      };
      const expectedHeight = randomNumber();
      const expectedHash = randomString();
      const expectedTransactionNumber = TransactionNumber.construct(expectedHeight, 0);
      const verifyMock = spyOn(bitcoinProcessor, 'verifyBlock' as any).and.returnValue(Promise.resolve(true));
      const transactions = createTransactions(BitcoinProcessor['pageSizeInBlocks'], expectedHeight, true);
      const laterThanMock = spyOn(bitcoinProcessor['transactionStore'], 'getTransactionsStartingFrom').and.returnValue(Promise.resolve(transactions));
      const actual = await bitcoinProcessor.transactions(expectedTransactionNumber, expectedHash);
      expect(verifyMock).toHaveBeenCalled();
      expect(laterThanMock).toHaveBeenCalled();
      expect(actual.moreTransactions).toBeTruthy();
      done();
    });
  });

  describe('firstValidTransaction', () => {
    it('should return the first of the valid transactions', async (done) => {
      const transactions: TransactionModel[] = [];
      let heights: number[] = [];
      const count = 10;
      for (let i = 0; i < count; i++) {
        const height = randomNumber();
        const feePaidRandom = randomNumber();

        heights.push(height);
        transactions.push({
          anchorString: randomString(),
          transactionNumber: TransactionNumber.construct(height, randomNumber()),
          transactionTime: height,
          transactionTimeHash: randomString(),
          transactionFeePaid: feePaidRandom,
          normalizedTransactionFee: feePaidRandom,
          writer: randomString()
        });
      }
      const verifyMock = spyOn(bitcoinProcessor, 'verifyBlock' as any).and.callFake((height: number) => {
        expect(height).toEqual(heights.shift()!);
        return Promise.resolve(heights.length === 0);
      });
      const actual = await bitcoinProcessor.firstValidTransaction(transactions);
      expect(verifyMock).toHaveBeenCalledTimes(count);
      expect(actual).toBeDefined();
      done();
    });
    it('should return undefined if no valid transactions are found', async (done) => {
      const transactions = createTransactions();
      const verifyMock = spyOn(bitcoinProcessor, 'verifyBlock' as any).and.returnValue(Promise.resolve(false));
      const actual = await bitcoinProcessor.firstValidTransaction(transactions);
      expect(actual).toBeUndefined();
      expect(verifyMock).toHaveBeenCalled();
      done();
    });
  });

  describe('writeTransaction', () => {
    const bitcoinFee = 4000;
    const lowLevelWarning = testConfig.lowBalanceNoticeInDays! * 24 * 6 * bitcoinFee;

    beforeEach(() => {
      bitcoinProcessor['lastProcessedBlock'] = { height: randomNumber(), hash: randomString(), previousHash: randomString() };
    });

    it('should write a transaction if there are enough Satoshis', async (done) => {
      const monitorAddSpy = spyOn(bitcoinProcessor['spendingMonitor'], 'addTransactionDataBeingWritten');
      const getCoinsSpy = spyOn(bitcoinProcessor['bitcoinClient'], 'getBalanceInSatoshis').and.returnValue(Promise.resolve(lowLevelWarning + 1));
      spyOn(bitcoinProcessor['bitcoinClient'], 'createSidetreeTransaction').and.returnValue(Promise.resolve({
        transactionId: 'string',
        transactionFee: bitcoinFee,
        serializedTransactionObject: 'string'
      }));
      spyOn(bitcoinProcessor['spendingMonitor'], 'isCurrentFeeWithinSpendingLimit').and.returnValue(Promise.resolve(true));

      const hash = randomString();
      const broadcastSpy = spyOn(bitcoinProcessor['bitcoinClient'], 'broadcastSidetreeTransaction' as any).and.returnValue(Promise.resolve('someHash'));

      await bitcoinProcessor.writeTransaction(hash, bitcoinFee);
      expect(getCoinsSpy).toHaveBeenCalled();
      expect(broadcastSpy).toHaveBeenCalled();
      expect(monitorAddSpy).toHaveBeenCalledWith(hash);
      done();
    });

    it('should warn if the number of Satoshis are under the lowBalance calculation', async (done) => {
      const monitorAddSpy = spyOn(bitcoinProcessor['spendingMonitor'], 'addTransactionDataBeingWritten');
      const getCoinsSpy = spyOn(bitcoinProcessor['bitcoinClient'], 'getBalanceInSatoshis').and.returnValue(Promise.resolve(lowLevelWarning - 1));
      spyOn(bitcoinProcessor['spendingMonitor'],'isCurrentFeeWithinSpendingLimit').and.returnValue(Promise.resolve(true));
      const hash = randomString();
      const broadcastSpy = spyOn(bitcoinProcessor['bitcoinClient'], 'broadcastSidetreeTransaction' as any).and.returnValue(Promise.resolve('someHash'));
      spyOn(bitcoinProcessor['bitcoinClient'], 'createSidetreeTransaction').and.returnValue(Promise.resolve({
        transactionId: 'string',
        transactionFee: bitcoinFee,
        serializedTransactionObject: 'string'
      }));
      const errorSpy = spyOn(global.console, 'error').and.callFake((message: string) => {
        expect(message).toContain('fund your wallet');
      });
      await bitcoinProcessor.writeTransaction(hash, bitcoinFee);
      expect(getCoinsSpy).toHaveBeenCalled();
      expect(broadcastSpy).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();
      expect(monitorAddSpy).toHaveBeenCalled();
      done();
    });

    it('should fail if there are not enough satoshis to create a transaction', async (done) => {
      const monitorAddSpy = spyOn(bitcoinProcessor['spendingMonitor'], 'addTransactionDataBeingWritten');
      const getCoinsSpy = spyOn(bitcoinProcessor['bitcoinClient'], 'getBalanceInSatoshis').and.returnValue(Promise.resolve(0));
      spyOn(bitcoinProcessor['spendingMonitor'], 'isCurrentFeeWithinSpendingLimit').and.returnValue(Promise.resolve(true));
      const hash = randomString();
      spyOn(bitcoinProcessor['bitcoinClient'], 'createSidetreeTransaction').and.returnValue(Promise.resolve({
        transactionId: 'string',
        transactionFee: Number.MAX_SAFE_INTEGER,
        serializedTransactionObject: 'string'
      }));
      const broadcastSpy = spyOn(bitcoinProcessor['bitcoinClient'], 'broadcastSidetreeTransaction' as any).and.callFake(() => {
        fail('writeTransaction should have stopped before calling broadcast');
      });
      try {
        await bitcoinProcessor.writeTransaction(hash, 4000);
        fail('should have thrown');
      } catch (error) {
        expect(error instanceof RequestError).toBeTruthy();
        expect(error.status).toEqual(400);
        expect(error.code).toEqual(SharedErrorCode.NotEnoughBalanceForWrite);

        expect(getCoinsSpy).toHaveBeenCalled();
        expect(broadcastSpy).not.toHaveBeenCalled();
      } finally {
        expect(monitorAddSpy).not.toHaveBeenCalled();
        done();
      }
    });
    it('should fail if the current fee is over the spending limits', async (done) => {
      const monitorAddSpy = spyOn(bitcoinProcessor['spendingMonitor'], 'addTransactionDataBeingWritten');
      const spendLimitSpy = spyOn(bitcoinProcessor['spendingMonitor'], 'isCurrentFeeWithinSpendingLimit').and.returnValue(Promise.resolve(false));
      const broadcastSpy = spyOn(bitcoinProcessor['bitcoinClient'], 'broadcastSidetreeTransaction' as any);
      const createSidetreeTransactionSpy = spyOn(bitcoinProcessor['bitcoinClient'], 'createSidetreeTransaction').and.returnValue(Promise.resolve({
        transactionId: 'string',
        transactionFee: bitcoinFee,
        serializedTransactionObject: 'string'
      }));

      try {
        await bitcoinProcessor.writeTransaction('some data', bitcoinFee);
        fail('expected to throw');
      } catch (error) {
        expect(error.status).toEqual(httpStatus.BAD_REQUEST);
        expect(error.code).toEqual(SharedErrorCode.SpendingCapPerPeriodReached);
      }

      expect(broadcastSpy).not.toHaveBeenCalled();
      expect(spendLimitSpy).toHaveBeenCalledWith(bitcoinFee, bitcoinProcessor['lastProcessedBlock']!.height);
      expect(monitorAddSpy).not.toHaveBeenCalled();
      expect(createSidetreeTransactionSpy).toHaveBeenCalledTimes(1);
      done();
    });
  });

  describe('getNormalizedFee', () => {

    let mockedCurrentHeight: number;
    let validBlockHeight: number;

    beforeEach(() => {
      mockedCurrentHeight = bitcoinProcessor['genesisBlockNumber'] + 200;
      validBlockHeight = mockedCurrentHeight - 50;

      spyOn(bitcoinProcessor['bitcoinClient'], 'getCurrentBlockHeight' as any).and.returnValue(Promise.resolve(mockedCurrentHeight));
    });

    it('should throw if the input is less than the genesis block', async () => {
      try {
        await bitcoinProcessor.getNormalizedFee(0);
        fail('should have failed');
      } catch (error) {
        expect(error.status).toEqual(httpStatus.BAD_REQUEST);
        expect(error.code).toEqual(SharedErrorCode.BlockchainTimeOutOfRange);
      }
    });

    it('should throw if the the quantile calculator does not return a value.', async () => {
      spyOn(bitcoinProcessor['quantileCalculator'], 'getQuantile').and.returnValue(undefined);

      try {
        await bitcoinProcessor.getNormalizedFee(validBlockHeight);
        fail('should have failed');
      } catch (error) {
        expect(error.status).toEqual(httpStatus.BAD_REQUEST);
        expect(error.code).toEqual(SharedErrorCode.BlockchainTimeOutOfRange);
      }
    });

    it('should return the value from the quantile calculator.', async () => {
      spyOn(bitcoinProcessor['quantileCalculator'], 'getQuantile').and.returnValue(509);

      const response = await bitcoinProcessor.getNormalizedFee(validBlockHeight);
      expect(response).toBeDefined();
      expect(response.normalizedTransactionFee).toEqual(509);
    });
  });

  describe('periodicPoll', () => {
    beforeEach(() => {
      periodicPollSpy.and.callThrough();
    });

    it('should call processTransactions from its last known point', async (done) => {
      const lastBlock = randomBlock();
      const nextBlock = randomNumber();
      const nextHash = randomString();
      bitcoinProcessor['lastProcessedBlock'] = lastBlock;
      processTransactionsSpy.and.callFake((block: IBlockInfo) => {
        expect(block.height).toEqual(lastBlock.height);
        expect(block.hash).toEqual(lastBlock.hash);
        return Promise.resolve({
          hash: nextHash,
          height: nextBlock
        });
      });

      spyOn(bitcoinProcessor as any,'getStartingBlockForPeriodicPoll').and.returnValue(Promise.resolve(lastBlock));
      /* tslint:disable-next-line */
      await bitcoinProcessor['periodicPoll']();
      // need to wait for the process call
      setTimeout(() => {
        expect(bitcoinProcessor['pollTimeoutId']).toBeDefined();
        // clean up
        clearTimeout(bitcoinProcessor['pollTimeoutId']);
        done();
      }, 300);

      expect(processTransactionsSpy).toHaveBeenCalled();
    });

    it('should not call process transaction if the starting block is undefined', async (done) => {
      spyOn(bitcoinProcessor as any,'getStartingBlockForPeriodicPoll').and.returnValue(Promise.resolve(undefined));

      await bitcoinProcessor['periodicPoll']();
      // need to wait for the process call
      setTimeout(() => {
        expect(bitcoinProcessor['pollTimeoutId']).toBeDefined();
        // clean up
        clearTimeout(bitcoinProcessor['pollTimeoutId']);
        done();
      }, 300);

      expect(processTransactionsSpy).not.toHaveBeenCalled();
      done();
    });

    it('should not throw if the processing throws', async (done) => {
      spyOn(bitcoinProcessor as any,'getStartingBlockForPeriodicPoll').and.throwError('Test error');

      try {
        await bitcoinProcessor['periodicPoll']();
      } catch (e) {
        fail('There should not be any exception thrown.');
      }

      // need to wait for the process call
      setTimeout(() => {
        expect(bitcoinProcessor['pollTimeoutId']).toBeDefined();
        // clean up
        clearTimeout(bitcoinProcessor['pollTimeoutId']);
        done();
      }, 300);

      done();
    });

    it('should set a timeout to call itself', async (done) => {
      processTransactionsSpy.and.returnValue(Promise.resolve({
        hash: randomString(),
        height: randomNumber()
      }));

      spyOn(bitcoinProcessor as any,'getStartingBlockForPeriodicPoll').and.returnValue(bitcoinProcessor['lastProcessedBlock']);

      /* tslint:disable-next-line */
      bitcoinProcessor['periodicPoll']();
      // need to wait for the process call
      setTimeout(() => {
        expect(bitcoinProcessor['pollTimeoutId']).toBeDefined();
        // clean up
        clearTimeout(bitcoinProcessor['pollTimeoutId']);
        done();
      }, 300);
    });

    it('should clear the prevoius timeout if set', async (done) => {

      spyOn(bitcoinProcessor as any,'getStartingBlockForPeriodicPoll').and.returnValue(Promise.resolve());
      const clearTimeoutSpy = spyOn(global, 'clearTimeout').and.returnValue();

      bitcoinProcessor['pollTimeoutId'] = 1234;

      await bitcoinProcessor['periodicPoll']();

      // need to wait for the process call
      setTimeout(() => {
        expect(bitcoinProcessor['pollTimeoutId']).toBeDefined();
        // clean up
        clearTimeout(bitcoinProcessor['pollTimeoutId']);
        done();
      }, 300);

      expect(clearTimeoutSpy).toHaveBeenCalled();
    });
  });

  describe('processTransactions', () => {

    beforeEach(() => {
      processTransactionsSpy.and.callThrough();
    });

    it('should verify the start block', async (done) => {
      const hash = randomString();
      const startBlock = randomBlock(testConfig.genesisBlockNumber);
      const processMock = spyOn(bitcoinProcessor, 'processBlock' as any).and.returnValue(Promise.resolve(hash));
      const getCurrentHeightMock = spyOn(bitcoinProcessor['bitcoinClient'],'getCurrentBlockHeight').and.returnValue(Promise.resolve(startBlock.height + 1));
      const actual = await bitcoinProcessor['processTransactions'](startBlock);
      expect(actual.hash).toEqual(hash);
      expect(actual.height).toEqual(startBlock.height + 1);
      expect(bitcoinProcessor['lastProcessedBlock']).toBeDefined();
      expect(actual).toEqual(bitcoinProcessor['lastProcessedBlock']!);
      expect(processMock).toHaveBeenCalled();
      expect(getCurrentHeightMock).toHaveBeenCalled();
      done();
    });

    it('should call processBlock on all blocks within range', async (done) => {
      const hash = randomString();
      const startBlock = randomBlock(testConfig.genesisBlockNumber);
      const processMock = spyOn(bitcoinProcessor, 'processBlock' as any).and.returnValue(Promise.resolve(hash));
      const getCurrentHeightMock = spyOn(bitcoinProcessor['bitcoinClient'],'getCurrentBlockHeight').and.returnValue(Promise.resolve(startBlock.height + 9));

      const actual = await bitcoinProcessor['processTransactions'](startBlock);
      expect(bitcoinProcessor['lastProcessedBlock']).toBeDefined();
      expect(actual).toEqual(bitcoinProcessor['lastProcessedBlock']!);
      expect(getCurrentHeightMock).toHaveBeenCalled();
      expect(processMock).toHaveBeenCalledTimes(10);
      done();
    });

    it('should use the current tip if no end is specified', async (done) => {
      const hash = randomString();
      const startBlock = randomBlock(testConfig.genesisBlockNumber);
      const tipSpy = spyOn(bitcoinProcessor['bitcoinClient'], 'getCurrentBlockHeight' as any).and.returnValue(Promise.resolve(startBlock.height + 1));
      const processMock = spyOn(bitcoinProcessor, 'processBlock' as any).and.returnValue(Promise.resolve(hash));
      const actual = await bitcoinProcessor['processTransactions'](startBlock);
      expect(bitcoinProcessor['lastProcessedBlock']).toBeDefined();
      expect(actual).toEqual(bitcoinProcessor['lastProcessedBlock']!);
      // tslint:disable-next-line: max-line-length
      expect(tipSpy).toHaveBeenCalled();
      expect(processMock).toHaveBeenCalledTimes(2);
      done();
    });

    it('should throw if asked to start processing before genesis', async (done) => {
      // tslint:disable-next-line: max-line-length
      const tipSpy = spyOn(bitcoinProcessor['bitcoinClient'], 'getCurrentBlockHeight' as any).and.returnValue(Promise.resolve(testConfig.genesisBlockNumber + 1));
      const processMock = spyOn(bitcoinProcessor, 'processBlock' as any);
      try {
        await bitcoinProcessor['processTransactions']({ height: testConfig.genesisBlockNumber - 10, hash: randomString(), previousHash: randomString() });
        fail('should have thrown');
      } catch (error) {
        expect(error.message).toContain('before genesis');
        expect(tipSpy).not.toHaveBeenCalled();
        expect(processMock).not.toHaveBeenCalled();
      } finally {
        done();
      }
    });

    it('should throw if asked to process while the miners block height is below genesis', async (done) => {
      // tslint:disable-next-line: max-line-length
      const processMock = spyOn(bitcoinProcessor, 'processBlock' as any);
      try {
        await bitcoinProcessor['processTransactions']({ height: testConfig.genesisBlockNumber - 1, hash: randomString(), previousHash: randomString() });
        fail('should have thrown');
      } catch (error) {
        expect(error.message).toContain('before genesis');
        expect(processMock).not.toHaveBeenCalled();
      } finally {
        done();
      }
    });

    it('should recall previous hashes when calling processBlock', async (done) => {
      // Custom write some sequential blocks such that between blocks the previousHash changes.
      const numBlocks = randomNumber(10) + 2;
      const hashes: string[] = [];
      for (let i = 0; i < numBlocks; i++) {
        hashes[i] = randomString();
      }
      const offset = randomNumber(100) + testConfig.genesisBlockNumber;
      const tipSpy = spyOn(bitcoinProcessor['bitcoinClient'], 'getCurrentBlockHeight' as any).and.returnValue(Promise.resolve(offset + numBlocks - 1));
      const processMock = spyOn(bitcoinProcessor, 'processBlock' as any).and.callFake((height: number, hash: string) => {
        const index = height - offset;
        if (index !== 0) {
          expect(hash).toEqual(hashes[index - 1]);
        }
        return Promise.resolve(hashes[index]);
      });
      await bitcoinProcessor['processTransactions']({ height: offset, hash: randomString(), previousHash: randomString() });
      expect(tipSpy).toHaveBeenCalled();
      expect(processMock).toHaveBeenCalled();
      done();
    });
  });

  describe('getStartingBlockForInitialization', () => {

    beforeEach(() => {
      getStartingBlockForInitializationSpy.and.callThrough();
    });

    it('should return the block after the genesis block if no transactions are saved in the DB', async (done) => {

      const mockBlock: IBlockInfo = {
        hash: 'some_hash',
        height: randomNumber(),
        previousHash: 'some previous hash'
      };

      spyOn(bitcoinProcessor['bitcoinClient'], 'getBlockInfoFromHeight').and.callFake((inputBlockNumber) => {
        expect(inputBlockNumber).toEqual(bitcoinProcessor['genesisBlockNumber']);

        return Promise.resolve(mockBlock);
      });

      transactionStoreLatestTransactionSpy.and.returnValue(Promise.resolve());

      const startingBlock = await bitcoinProcessor['getStartingBlockForInitialization']();
      expect(startingBlock).toEqual(mockBlock);
      done();
    });

    it('should revert the DBs to the last saved transaction block in the transaction store.', async (done) => {
      const revertDbsSpy = spyOn(bitcoinProcessor as any, 'trimDatabasesToFeeSamplingGroupBoundary');
      const verifySpy = spyOn(bitcoinProcessor as any, 'verifyBlock');
      const revertChainSpy = spyOn(bitcoinProcessor as any, 'revertDatabases');

      const mockTxnModel: TransactionModel = {
        anchorString: 'anchor1',
        transactionTimeHash: 'timehash1',
        transactionTime: 100,
        transactionNumber: 200,
        transactionFeePaid: 300,
        normalizedTransactionFee: 400,
        writer: 'writer'
      };

      const mockBlock: IBlockInfo = {
        hash: 'some_hash',
        height: randomNumber(),
        previousHash: 'some previous hash'
      };

      transactionStoreLatestTransactionSpy.and.returnValue(Promise.resolve(mockTxnModel));
      revertDbsSpy.and.returnValue(Promise.resolve(mockBlock));
      verifySpy.and.returnValue(Promise.resolve(true));

      spyOn(bitcoinProcessor['bitcoinClient'], 'getBlockInfoFromHeight').and.callFake((inputBlockNumber) => {
        expect(inputBlockNumber).toEqual(mockBlock.height + 1);

        return Promise.resolve(mockBlock);
      });

      const startingBlock = await bitcoinProcessor['getStartingBlockForInitialization']();
      expect(startingBlock).toEqual(mockBlock);
      expect(revertDbsSpy).toHaveBeenCalledWith(mockTxnModel.transactionTime);
      expect(verifySpy).toHaveBeenCalledWith(mockTxnModel.transactionTime, mockTxnModel.transactionTimeHash);
      expect(revertChainSpy).not.toHaveBeenCalled();
      done();
    });

    it('should revert the blockchain if the last saved transaction is invalid.', async (done) => {
      const revertDbsSpy = spyOn(bitcoinProcessor as any, 'trimDatabasesToFeeSamplingGroupBoundary');
      const verifySpy = spyOn(bitcoinProcessor as any, 'verifyBlock');
      const revertChainSpy = spyOn(bitcoinProcessor as any, 'revertDatabases');

      const mockTxnModel: TransactionModel = {
        anchorString: 'anchor1',
        transactionTimeHash: 'timehash1',
        transactionTime: 100,
        transactionNumber: 200,
        transactionFeePaid: 300,
        normalizedTransactionFee: 400,
        writer: 'writer'
      };

      const mockBlock: IBlockInfo = {
        hash: 'some_hash',
        height: randomNumber(),
        previousHash: 'some previous hash'
      };

      transactionStoreLatestTransactionSpy.and.returnValue(Promise.resolve(mockTxnModel));
      verifySpy.and.returnValue(Promise.resolve(false));
      revertChainSpy.and.returnValue(Promise.resolve(mockBlock));

      spyOn(bitcoinProcessor['bitcoinClient'], 'getBlockInfoFromHeight').and.callFake((inputBlockNumber) => {
        expect(inputBlockNumber).toEqual(mockBlock.height + 1);

        return Promise.resolve(mockBlock);
      });

      const startingBlock = await bitcoinProcessor['getStartingBlockForInitialization']();

      expect(startingBlock).toEqual(mockBlock);
      expect(revertDbsSpy).not.toHaveBeenCalled();
      expect(verifySpy).toHaveBeenCalledWith(mockTxnModel.transactionTime, mockTxnModel.transactionTimeHash);
      expect(revertChainSpy).toHaveBeenCalled();
      done();
    });
  });

  describe('getStartingBlockForPeriodicPoll', () => {
    let actualLastProcessedBlock: IBlockInfo;

    beforeEach(() => {
      bitcoinProcessor['lastProcessedBlock'] = { height: randomNumber(), hash: randomString(), previousHash: randomString() };
      actualLastProcessedBlock = bitcoinProcessor['lastProcessedBlock'];
      spyOn(bitcoinProcessor['bitcoinClient'], 'getBlockInfoFromHeight').and.callFake((height: number) => {
        return Promise.resolve({
          height,
          hash: randomString(),
          previousHash: randomString()
        });
      });
      expect(actualLastProcessedBlock).toBeDefined();
    });

    it('should return the block after the last-processed-block', async () => {
      spyOn(bitcoinProcessor as any, 'verifyBlock').and.returnValue(Promise.resolve(true));
      spyOn(bitcoinProcessor['bitcoinClient'], 'getCurrentBlockHeight').and.returnValue(Promise.resolve(actualLastProcessedBlock.height + 1));

      const actual = await bitcoinProcessor['getStartingBlockForPeriodicPoll']();
      expect(actual).toBeDefined();
      expect(actual!.height).toEqual(actualLastProcessedBlock.height + 1);
    });

    it('should return undefined if the last-processed-block is same as the current height', async () => {
      spyOn(bitcoinProcessor as any, 'verifyBlock').and.returnValue(Promise.resolve(true));
      spyOn(bitcoinProcessor['bitcoinClient'], 'getCurrentBlockHeight').and.returnValue(Promise.resolve(actualLastProcessedBlock.height));

      const actual = await bitcoinProcessor['getStartingBlockForPeriodicPoll']();
      expect(actual).not.toBeDefined();
    });

    it('should revert blockchain if verifyblock fails', async () => {
      const mockHeightAfterRevert = actualLastProcessedBlock.height - 1;

      const revertBlockchainSpy = spyOn(bitcoinProcessor as any, 'revertDatabases');
      revertBlockchainSpy.and.returnValue({ height: mockHeightAfterRevert, hash: randomString() });

      spyOn(bitcoinProcessor as any, 'verifyBlock').and.returnValue(Promise.resolve(false));
      spyOn(bitcoinProcessor['bitcoinClient'], 'getCurrentBlockHeight').and.returnValue(Promise.resolve(actualLastProcessedBlock.height + 1));

      const actual = await bitcoinProcessor['getStartingBlockForPeriodicPoll']();
      expect(actual).toBeDefined();
      expect(actual!.height).toEqual(mockHeightAfterRevert + 1);
      expect(revertBlockchainSpy).toHaveBeenCalled();
    });
  });

  describe('revertDatabases', () => {
    it('should exponentially revert transactions', async (done) => {
      const transactions = createTransactions(10).sort((a, b) => b.transactionNumber - a.transactionNumber);
      const transactionCount = spyOn(bitcoinProcessor['transactionStore'],
        'getTransactionsCount').and.returnValue(Promise.resolve(transactions.length));
      const exponentialTransactions = spyOn(bitcoinProcessor['transactionStore'],
        'getExponentiallySpacedTransactions').and.returnValue(Promise.resolve(transactions));
      const firstValid = spyOn(bitcoinProcessor, 'firstValidTransaction').and.callFake((actualTransactions: TransactionModel[]) => {
        expect(actualTransactions).toEqual(transactions);
        return Promise.resolve(transactions[1]);
      });

      const mockRevertReturn: IBlockInfo = {
        height: randomNumber(),
        hash: randomString(),
        previousHash: randomString()
      };
      spyOn(bitcoinProcessor,'trimDatabasesToFeeSamplingGroupBoundary' as any).and.returnValue(Promise.resolve(mockRevertReturn));

      const getBlockSpy = spyOn(bitcoinProcessor['bitcoinClient'],'getBlockInfoFromHeight' as any);

      const actual = await bitcoinProcessor['revertDatabases']();
      expect(actual).toEqual(mockRevertReturn);
      expect(transactionCount).toHaveBeenCalled();
      expect(exponentialTransactions).toHaveBeenCalled();
      expect(firstValid).toHaveBeenCalled();
      expect(getBlockSpy).not.toHaveBeenCalled();
      done();
    });

    it('should continue to revert if the first exponential revert failed', async (done) => {
      const transactions = createTransactions(10).sort((a, b) => b.transactionNumber - a.transactionNumber);
      const transactionCount = spyOn(bitcoinProcessor['transactionStore'],
        'getTransactionsCount').and.returnValue(Promise.resolve(transactions.length));
      const exponentialTransactions = spyOn(bitcoinProcessor['transactionStore'],
        'getExponentiallySpacedTransactions').and.returnValue(Promise.resolve(transactions));
      let validHasBeenCalledOnce = false;
      const firstValid = spyOn(bitcoinProcessor, 'firstValidTransaction').and.callFake((actualTransactions: TransactionModel[]) => {
        expect(actualTransactions).toEqual(transactions);
        if (validHasBeenCalledOnce) {
          return Promise.resolve(transactions[0]);
        } else {
          validHasBeenCalledOnce = true;
          return Promise.resolve(undefined);
        }
      });
      const removeTransactions = spyOn(bitcoinProcessor['transactionStore'],
        'removeTransactionsLaterThan').and.returnValue(Promise.resolve());

      const mockRevertReturn: IBlockInfo = {
        height: randomNumber(),
        hash: randomString(),
        previousHash: randomString()
      };
      spyOn(bitcoinProcessor,'trimDatabasesToFeeSamplingGroupBoundary' as any).and.returnValue(Promise.resolve(mockRevertReturn));

      const getBlockSpy = spyOn(bitcoinProcessor['bitcoinClient'],'getBlockInfoFromHeight' as any);

      const actual = await bitcoinProcessor['revertDatabases']();
      expect(actual).toEqual(mockRevertReturn);
      expect(transactionCount).toHaveBeenCalledTimes(2);
      expect(exponentialTransactions).toHaveBeenCalledTimes(2);
      expect(firstValid).toHaveBeenCalledTimes(2);
      expect(removeTransactions).toHaveBeenCalledTimes(1);
      expect(getBlockSpy).not.toHaveBeenCalled();
      done();
    });

    it('should stop reverting if it has ran out of transactions', async (done) => {
      let transactions = createTransactions(10);
      const transactionCount = spyOn(bitcoinProcessor['transactionStore'],
        'getTransactionsCount').and.callFake(() => {
          return Promise.resolve(transactions.length);
        });
      const exponentialTransactions = spyOn(bitcoinProcessor['transactionStore'],
        'getExponentiallySpacedTransactions').and.returnValue(Promise.resolve(transactions));
      const firstValid = spyOn(bitcoinProcessor, 'firstValidTransaction').and.returnValue(Promise.resolve(undefined));
      const removeTransactions = spyOn(bitcoinProcessor['transactionStore'],
        'removeTransactionsLaterThan').and.callFake((transactionNumber: number) => {
          expect(transactionNumber).toEqual(transactions[0].transactionNumber);
          transactions = [];
          return Promise.resolve();
        });
      spyOn(bitcoinProcessor['quantileCalculator'], 'removeGroupsGreaterThanOrEqual').and.returnValue(Promise.resolve());

      const mockGetBlockReturn: IBlockInfo = {
        height: randomNumber(),
        hash: randomString(),
        previousHash: randomString()
      };
      const getBlockSpy = spyOn(bitcoinProcessor['bitcoinClient'],'getBlockInfoFromHeight' as any).and.returnValue(Promise.resolve(mockGetBlockReturn));

      const revertDbsSpy = spyOn(bitcoinProcessor,'trimDatabasesToFeeSamplingGroupBoundary' as any);

      const actual = await bitcoinProcessor['revertDatabases']();
      expect(actual).toEqual(mockGetBlockReturn);
      expect(transactionCount).toHaveBeenCalled();
      expect(exponentialTransactions).toHaveBeenCalled();
      expect(firstValid).toHaveBeenCalled();
      expect(removeTransactions).toHaveBeenCalled();
      expect(getBlockSpy).toHaveBeenCalledWith(testConfig.genesisBlockNumber);
      expect(revertDbsSpy).not.toHaveBeenCalled();
      done();
    });
  });

  describe('trimDatabasesToFeeSamplingGroupBoundary', () => {
    it('should revert the DBs to the correct values.', async () => {
      const mockFirstBlockInGroup = bitcoinProcessor['genesisBlockNumber'] + 100;
      const firstBlockInGroupSpy = spyOn(bitcoinProcessor, 'getFirstBlockInGroup' as any).and.returnValue(mockFirstBlockInGroup);

      const txnConstructSpy = spyOn(TransactionNumber, 'construct');

      const revertQuantileState = spyOn(bitcoinProcessor['quantileCalculator'], 'removeGroupsGreaterThanOrEqual').and.returnValue(Promise.resolve());
      const removeTransactions = spyOn(bitcoinProcessor['transactionStore'], 'removeTransactionsLaterThan').and.callFake(() => {
        // Make sure that that this call is made BEFORE the quantile-store call.
        expect(revertQuantileState.calls.count()).toEqual(0);

        return Promise.resolve();
      });

      const mockGroupIdFromBlock = 400;
      spyOn(bitcoinProcessor, 'getGroupIdFromBlock' as any).and.returnValue(mockGroupIdFromBlock);

      const mockBlockInfo: IBlockInfo = {
        height: randomNumber(),
        hash: randomString(),
        previousHash: randomString()
      };

      spyOn(bitcoinProcessor['bitcoinClient'],'getBlockInfoFromHeight').and.callFake((inputBlockNumber) => {
        expect(inputBlockNumber).toEqual(mockFirstBlockInGroup - 1);

        return Promise.resolve(mockBlockInfo);
      });

      const inputBlock = 500;
      const actual = await bitcoinProcessor['trimDatabasesToFeeSamplingGroupBoundary'](inputBlock);

      expect(actual).toEqual(mockBlockInfo);
      expect(firstBlockInGroupSpy).toHaveBeenCalledWith(inputBlock);
      expect(txnConstructSpy).toHaveBeenCalledWith(mockFirstBlockInGroup, 0);
      expect(removeTransactions).toHaveBeenCalled();
      expect(revertQuantileState).toHaveBeenCalledWith(mockGroupIdFromBlock);
    });

    it('should return the genesis block if the first block in group goes below the genesis block.', async () => {
      const mockFirstBlockInGroup = bitcoinProcessor['genesisBlockNumber'] - 10;
      spyOn(bitcoinProcessor, 'getFirstBlockInGroup' as any).and.returnValue(mockFirstBlockInGroup);

      spyOn(bitcoinProcessor['quantileCalculator'], 'removeGroupsGreaterThanOrEqual').and.returnValue(Promise.resolve());
      spyOn(bitcoinProcessor['transactionStore'], 'removeTransactionsLaterThan').and.returnValue(Promise.resolve());

      const mockBlockInfo: IBlockInfo = {
        height: randomNumber(),
        hash: randomString(),
        previousHash: randomString()
      };

      spyOn(bitcoinProcessor['bitcoinClient'],'getBlockInfoFromHeight').and.callFake((inputBlockNumber) => {
        expect(inputBlockNumber).toEqual(bitcoinProcessor['genesisBlockNumber']);

        return Promise.resolve(mockBlockInfo);
      });

      const actual = await bitcoinProcessor['trimDatabasesToFeeSamplingGroupBoundary'](500);

      expect(actual).toEqual(mockBlockInfo);
    });
  });

  describe('getFirstBlockInGroup', () => {
    it('should round the value correctly', async () => {
      // The expected values are dependent upon the protocol-parameters.json so if those values
      // are changed, these expected value may as well

      const actualRoundDown = bitcoinProcessor['getFirstBlockInGroup'](84);
      expect(actualRoundDown).toEqual(0);

      const actualRoundUp = bitcoinProcessor['getFirstBlockInGroup'](124);
      expect(actualRoundUp).toEqual(100);
    });
  });

  describe('verifyBlock', () => {
    it('should return true if the hash matches given a block height', async (done) => {
      const height = randomNumber();
      const hash = randomString();
      bitcoinProcessor['lastProcessedBlock'] = {
        height: 1234,
        hash: 'some hash',
        previousHash: 'previous hash'
      };
      const heightMock = spyOn(bitcoinProcessor['bitcoinClient'], 'getCurrentBlockHeight').and.returnValue(Promise.resolve(Number.MAX_SAFE_INTEGER));
      const hashMock = spyOn(bitcoinProcessor['bitcoinClient'], 'getBlockHash' as any).and.returnValue(hash);
      const actual = await bitcoinProcessor['verifyBlock'](height, hash);
      expect(actual).toBeTruthy();
      expect(heightMock).toHaveBeenCalled();
      expect(hashMock).toHaveBeenCalled();
      done();
    });

    it('should return false if the hash does not match given a block height', async (done) => {
      const height = randomNumber();
      const hash = randomString();
      bitcoinProcessor['lastProcessedBlock'] = {
        height: 1234,
        hash: 'some hash',
        previousHash: 'previous hash'
      };
      const heightMock = spyOn(bitcoinProcessor['bitcoinClient'], 'getCurrentBlockHeight').and.returnValue(Promise.resolve(Number.MAX_SAFE_INTEGER));
      const hashMock = spyOn(bitcoinProcessor['bitcoinClient'], 'getBlockHash' as any).and.returnValue(randomString());
      const actual = await bitcoinProcessor['verifyBlock'](height, hash);
      expect(actual).toBeFalsy();
      expect(heightMock).toHaveBeenCalled();
      expect(hashMock).toHaveBeenCalled();
      done();
    });

    it('should return false if the height passed in is outside block height range', async (done) => {
      const height = randomNumber();
      const hash = randomString();
      bitcoinProcessor['lastProcessedBlock'] = {
        height: 1234,
        hash: 'some hash',
        previousHash: 'previous hash'
      };
      const heightMock = spyOn(bitcoinProcessor['bitcoinClient'], 'getCurrentBlockHeight').and.returnValue(Promise.resolve(1));
      const hashMock = spyOn(bitcoinProcessor['bitcoinClient'], 'getBlockHash' as any).and.returnValue(randomString());
      const actual = await bitcoinProcessor['verifyBlock'](height, hash);
      expect(actual).toBeFalsy(); // false because 1 < 1234
      expect(heightMock).toHaveBeenCalled();
      expect(hashMock).not.toHaveBeenCalled();
      done();
    });
  });

  describe('processBlock', () => {

    // creates a response object for Bitcoin
    async function generateBlock (blockHeight: number, data?: () => string | string[] | undefined): Promise<BitcoinBlockModel> {
      const tx: Transaction[] = [];
      const count = randomNumber(100) + 10;
      for (let i = 0; i < count; i++) {
        const transaction = BitcoinDataGenerator.generateBitcoinTransaction(BitcoinClient.generatePrivateKey('testnet'), 1);
        // data generation
        if (data) {
          const hasData = data();

          // if the data returned is an array then add each value one by one.
          // otherwise add the single value
          if (hasData instanceof Array) {
            hasData.forEach(element => {
              transaction.addData(Buffer.from(element));
            });
          } else if (hasData) {
            transaction.addData(Buffer.from(hasData));
          }
        }

        tx.push(transaction);
      }

      const blockHash = randomString();

      return {
        hash: blockHash,
        height: blockHeight,
        previousHash: randomString(),
        transactions: tx.map((txn) => {
          return {
            id: txn.id,
            blockHash: blockHash,
            confirmations: randomNumber(),
            inputs: txn.inputs.map((input) => { return BitcoinClient['createBitcoinInputModel'](input); }),
            outputs: txn.outputs.map((output) => { return BitcoinClient['createBitcoinOutputModel'](output); })
          };
        })
      };
    }

    it('should review all transactions in a block and add valid sidetree txns to the transactionStore', async (done) => {
      const block = randomNumber();
      const blockHash = randomString();
      const blockData: BitcoinBlockModel = {
        height: block,
        hash: blockHash,
        previousHash: 'previous_hash',
        transactions: [
          { id: 'id', blockHash: 'hash', confirmations: 5, inputs: [], outputs: [] },
          { id: 'id2', blockHash: 'hash2', confirmations: 5, inputs: [], outputs: [] },
          { id: 'id3', blockHash: 'hash3', confirmations: 5, inputs: [], outputs: [] }
        ]
      };

      const pofCalcSpy = spyOn(bitcoinProcessor, 'processBlockForPofCalculation' as any).and.returnValue(Promise.resolve());
      spyOn(bitcoinProcessor['bitcoinClient'], 'getBlockHash' as any).and.returnValue(blockHash);
      spyOn(bitcoinProcessor['bitcoinClient'], 'getBlock').and.returnValue(Promise.resolve(blockData));

      const mockSidetreeTxnModels: TransactionModel[] = [
        // tslint:disable-next-line: max-line-length
        { anchorString: 'anchor1', transactionTimeHash: 'timehash1', transactionTime: 100, transactionNumber: 200, transactionFeePaid: 300, normalizedTransactionFee: 400, writer: 'writer1' },
        // tslint:disable-next-line: max-line-length
        { anchorString: 'anchor2', transactionTimeHash: 'timehash2', transactionTime: 150, transactionNumber: 250, transactionFeePaid: 350, normalizedTransactionFee: 450, writer: 'writer2' }
      ];

      // Return the mock values one-by-one in order
      let getSidetreeTxnCallIndex = 0;
      spyOn(bitcoinProcessor as any,'getSidetreeTransactionModelIfExist').and.callFake(() => {

        let retValue: TransactionModel | undefined = undefined;

        if (getSidetreeTxnCallIndex < mockSidetreeTxnModels.length) {
          retValue = mockSidetreeTxnModels[getSidetreeTxnCallIndex];
        }

        getSidetreeTxnCallIndex++;

        // Return undefined if we don't have data (to mock no valid sidetree transactions)
        return Promise.resolve(retValue);
      });

      // Verify that the add transaction is called with the correct values
      let addTxnCallIndex = 0;
      const addTransaction = spyOn(bitcoinProcessor['transactionStore'], 'addTransaction').and.callFake((sidetreeTransaction: TransactionModel) => {
        expect(sidetreeTransaction).toEqual(mockSidetreeTxnModels[addTxnCallIndex]);
        addTxnCallIndex++;
        return Promise.resolve(undefined);
      });
      const actual = await bitcoinProcessor['processBlock'](block, blockData.previousHash);
      expect(actual).toEqual(blockData.hash);
      expect(pofCalcSpy).toHaveBeenCalled();
      expect(addTransaction.calls.count()).toEqual(2);
      expect(addTxnCallIndex).toEqual(2);

      done();
    });

    it('should not add anything to the transaction store if no sidetree transaction is found.', async (done) => {
      const block = randomNumber();
      const blockHash = randomString();
      const blockData: BitcoinBlockModel = {
        height: block,
        hash: blockHash,
        previousHash: 'previous_hash',
        transactions: [
          { id: 'id', blockHash: 'hash', confirmations: 5, inputs: [], outputs: [] },
          { id: 'id2', blockHash: 'hash2', confirmations: 5, inputs: [], outputs: [] }
        ]
      };

      const pofCalcSpy = spyOn(bitcoinProcessor, 'processBlockForPofCalculation' as any).and.returnValue(Promise.resolve());
      spyOn(bitcoinProcessor['bitcoinClient'], 'getBlockHash' as any).and.returnValue(blockHash);
      spyOn(bitcoinProcessor['bitcoinClient'], 'getBlock').and.returnValue(Promise.resolve(blockData));
      spyOn(bitcoinProcessor as any,'getSidetreeTransactionModelIfExist').and.returnValue(undefined);

      const addTransactionSpy = spyOn(bitcoinProcessor['transactionStore'], 'addTransaction');

      const actual = await bitcoinProcessor['processBlock'](block, blockData.previousHash);
      expect(actual).toEqual(blockData.hash);
      expect(pofCalcSpy).toHaveBeenCalled();
      expect(addTransactionSpy).not.toHaveBeenCalled();

      done();
    });

    it('should throw if any exception is thrown while going through transactions.', async (done) => {
      const block = randomNumber();
      const blockHash = randomString();
      const blockData: BitcoinBlockModel = {
        height: block,
        hash: blockHash,
        previousHash: 'previous_hash',
        transactions: [
          { id: 'id', blockHash: 'hash', confirmations: 5, inputs: [], outputs: [] }
        ]
      };

      const pofCalcSpy = spyOn(bitcoinProcessor, 'processBlockForPofCalculation' as any).and.returnValue(Promise.resolve());
      spyOn(bitcoinProcessor['bitcoinClient'], 'getBlockHash' as any).and.returnValue(blockHash);
      spyOn(bitcoinProcessor['bitcoinClient'], 'getBlock').and.returnValue(Promise.resolve(blockData));

      spyOn(bitcoinProcessor as any,'getSidetreeTransactionModelIfExist').and.throwError('Test exception');

      const addTransaction = spyOn(bitcoinProcessor['transactionStore'], 'addTransaction');

      try {
        await bitcoinProcessor['processBlock'](block, blockData.previousHash);
        fail('Expected exception is not thrown');
      // tslint:disable-next-line: no-empty
      } catch (e) { }

      expect(pofCalcSpy).toHaveBeenCalled();
      expect(addTransaction).not.toHaveBeenCalled();
      done();
    });

    it('should throw if the previousBlockHash does not match the bitcoin block retrieved', async (done) => {
      const block = randomNumber();
      const blockData = await generateBlock(block, () => { return undefined; });
      const blockHash = randomString();
      spyOn(bitcoinProcessor['bitcoinClient'], 'getBlockHash' as any).and.returnValue(blockHash);
      const rpcMock = spyOn(bitcoinProcessor['bitcoinClient'], 'getBlock');
      rpcMock.and.returnValue(Promise.resolve(blockData));

      try {
        await bitcoinProcessor['processBlock'](block, blockData.previousHash + '-but-not-though');
        fail('expected to throw');
      } catch (error) {
        expect(rpcMock).toHaveBeenCalled();
      } finally {
        done();
      }
    });

    describe('processBlockForPofCalculation', async () => {
      it('should only add the non-sidetree transactions to the sampler.', async (done) => {
        const block = randomNumber();
        const blockData = await generateBlock(block, () => {
          return randomString();
        });

        let numOfNonSidetreeTransactions = 0;
        spyOn(bitcoinProcessor['sidetreeTransactionParser'], 'parse').and.callFake(() => {

          if (Math.random() > 0.2) {
            return Promise.resolve({ data: randomString(), writer: randomString() });
          }

          numOfNonSidetreeTransactions++;
          return Promise.resolve(undefined);
        });

        const txnSamplerResetSpy = spyOn(bitcoinProcessor['transactionSampler'], 'resetPsuedoRandomSeed');
        const txnSamplerAddSpy = spyOn(bitcoinProcessor['transactionSampler'], 'addElement').and.returnValue(undefined);

        await bitcoinProcessor['processBlockForPofCalculation'](block, blockData);
        expect(txnSamplerAddSpy.calls.count()).toEqual(numOfNonSidetreeTransactions);
        expect(txnSamplerResetSpy).toHaveBeenCalled();
        done();
      });

      it('should add values to the quantile calculator only if we have reached the target group count', async (done) => {
        const block = randomNumber();
        const blockData = await generateBlock(block, () => {
          if (Math.random() > 0.2) {
            const id = randomString();
            return testConfig.sidetreeTransactionPrefix + id;
          }

          return randomString();
        });

        const txnSamplerClearSpy = spyOn(bitcoinProcessor['transactionSampler'], 'clear');
        const txnSamplerResetSpy = spyOn(bitcoinProcessor['transactionSampler'], 'resetPsuedoRandomSeed');

        const mockedSampleTxns = [ 'abc', '123', '23k', '35d', '4', 'tr', 'afe', '12d', '3rf' ];
        spyOn(bitcoinProcessor['transactionSampler'], 'getSample').and.returnValue(mockedSampleTxns);
        spyOn(bitcoinProcessor['transactionSampler'], 'addElement').and.returnValue(undefined);
        spyOn(bitcoinProcessor, 'isGroupBoundary' as any).and.returnValue(true);

        let mockedTransactionFees = new Array<number>();
        spyOn(bitcoinProcessor['bitcoinClient'], 'getTransactionFeeInSatoshis' as any).and.callFake((_id: any) => {
          const fee = randomNumber();
          mockedTransactionFees.push(fee);
          return fee;
        });

        const expectedGroupId = bitcoinProcessor['getGroupIdFromBlock'](block);
        const quantileCalculatorAddSpy = spyOn(bitcoinProcessor['quantileCalculator'], 'add').and.callFake(async (groupId, fees) => {
          expect(groupId).toEqual(expectedGroupId);
          expect(fees).toEqual(mockedTransactionFees);
        });

        await bitcoinProcessor['processBlockForPofCalculation'](block, blockData);
        expect(quantileCalculatorAddSpy).toHaveBeenCalled();
        expect(txnSamplerClearSpy).toHaveBeenCalled();
        expect(txnSamplerResetSpy).toHaveBeenCalled();
        done();
      });
    });

  });

  describe('getSidetreeTransactionModelIfExist', async () => {
    it('should only return the sidetree transaction data if exist.', async (done) => {

      const mockSidetreeData: SidetreeTransactionModel = {
        data: 'sidetree data',
        writer: 'writer'
      };
      spyOn(bitcoinProcessor['sidetreeTransactionParser'], 'parse').and.returnValue(Promise.resolve(mockSidetreeData));

      const mockTxnFee = 1000;
      const mockNormalizedFeeModel: TransactionFeeModel = { normalizedTransactionFee: 300 };

      const getTxnFeeSpy = spyOn(bitcoinProcessor['bitcoinClient'], 'getTransactionFeeInSatoshis').and.returnValue(Promise.resolve(mockTxnFee));
      const getNormalizedFeeSpy = spyOn(bitcoinProcessor, 'getNormalizedFee').and.returnValue(Promise.resolve(mockNormalizedFeeModel));

      const mockTxnNumber = 1000;
      spyOn(TransactionNumber, 'construct').and.returnValue(1000);

      const mockTxnBlock = 20;
      const mockTxn: BitcoinTransactionModel = {
        blockHash: 'block hash',
        confirmations: 2,
        id: 'id',
        outputs: [],
        inputs: []
      };

      const mockOutputTxnModel: TransactionModel = {
        anchorString: mockSidetreeData.data,
        normalizedTransactionFee: mockNormalizedFeeModel.normalizedTransactionFee,
        transactionFeePaid: mockTxnFee,
        transactionNumber: mockTxnNumber,
        transactionTime: mockTxnBlock,
        transactionTimeHash: mockTxn.blockHash,
        writer: mockSidetreeData.writer
      };

      const output = await bitcoinProcessor['getSidetreeTransactionModelIfExist'](mockTxn, 10, mockTxnBlock);
      expect(output).toBeDefined();
      expect(output).toEqual(mockOutputTxnModel);
      expect(getTxnFeeSpy).toHaveBeenCalled();
      expect(getNormalizedFeeSpy).toHaveBeenCalled();

      done();
    });

    it('should return undefined if the parse result is undefined.', async (done) => {

      spyOn(bitcoinProcessor['sidetreeTransactionParser'], 'parse').and.returnValue(Promise.resolve(undefined));

      const getTxnFeeSpy = spyOn(bitcoinProcessor['bitcoinClient'], 'getTransactionFeeInSatoshis');
      const getNormalizedFeeSpy = spyOn(bitcoinProcessor, 'getNormalizedFee');

      const mockTxn: BitcoinTransactionModel = {
        blockHash: 'block hash',
        confirmations: 2,
        id: 'id',
        outputs: [],
        inputs: []
      };

      const output = await bitcoinProcessor['getSidetreeTransactionModelIfExist'](mockTxn, 10, 20);
      expect(output).not.toBeDefined();
      expect(getTxnFeeSpy).not.toHaveBeenCalled();
      expect(getNormalizedFeeSpy).not.toHaveBeenCalled();

      done();
    });
  });

  describe('getServiceVersion', () => {

    it('should return the correct response body for the version request', async () => {
      const expectedVersion: ServiceVersionModel = {
        name: 'test-service',
        version: 'x.y.z'
      };

      // Make the handle service version call return the test value
      spyOn(bitcoinProcessor['serviceInfoProvider'], 'getServiceVersion').and.returnValue(expectedVersion);

      const fetchedVersion = await bitcoinProcessor.getServiceVersion();

      expect(fetchedVersion.name).toEqual(expectedVersion.name);
      expect(fetchedVersion.version).toEqual(expectedVersion.version);
    });
  });

  describe('getValueTimeLock', () => {
    it('should call the lock resolver and return the value from it.', async (done) => {
      const mockValueTimeLock: ValueTimeLockModel = {
        amountLocked: 1000,
        identifier: 'lock identifier',
        owner: 'owner',
        unlockTransactionTime: 1233,
        lockTransactionTime: 1220
      };

      spyOn(bitcoinProcessor['lockResolver'], 'resolveSerializedLockIdentifierAndThrowOnError').and.returnValue(Promise.resolve(mockValueTimeLock));

      const actual = await bitcoinProcessor.getValueTimeLock('some serialized input');
      expect(actual).toEqual(mockValueTimeLock);
      done();
    });

    it('should throw request error if lockresolver throws any exception', async (done) => {
      spyOn(bitcoinProcessor['lockResolver'], 'resolveSerializedLockIdentifierAndThrowOnError').and.throwError('no lock found.');

      try {
        await bitcoinProcessor.getValueTimeLock('some serialized input');
        fail('Expected exception is not thrown');
      } catch (e) {
        const expectedError = new RequestError(ResponseStatus.NotFound, SharedErrorCode.ValueTimeLockNotFound);
        expect(e).toEqual(expectedError);
      }

      done();
    });
  });

  describe('generatePrivateKeyForTestnet', () => {
    it('should return a private key string by calling the BitcoinClient', () => {
      const mockPrivateKey = 'mocked private key';
      spyOn(BitcoinClient, 'generatePrivateKey').and.returnValue(mockPrivateKey);

      const actual = BitcoinProcessor.generatePrivateKeyForTestnet();
      expect(actual).toEqual(mockPrivateKey);
    });
  });

  describe('getActiveValueTimeLockForThisNode', () => {
    it('should return the value-time-lock from the lockmonitor', () => {
      const mockValueTimeLock: ValueTimeLockModel = {
        amountLocked: 1000,
        identifier: 'lock identifier',
        owner: 'owner',
        unlockTransactionTime: 1233,
        lockTransactionTime: 1220
      };

      spyOn(bitcoinProcessor['lockMonitor'], 'getCurrentValueTimeLock').and.returnValue(mockValueTimeLock);

      const actual = bitcoinProcessor.getActiveValueTimeLockForThisNode();
      expect(actual).toEqual(mockValueTimeLock);
    });

    it('should throw not-found error if the lock monitor returns undefined.', () => {
      spyOn(bitcoinProcessor['lockMonitor'], 'getCurrentValueTimeLock').and.returnValue(undefined);

      try {
        bitcoinProcessor.getActiveValueTimeLockForThisNode();
        fail('Expected exception is not thrown');
      } catch (e) {
        const expectedError = new RequestError(ResponseStatus.NotFound, SharedErrorCode.ValueTimeLockNotFound);
        expect(e).toEqual(expectedError);
      }
    });

    it('should throw pending-state exception if the lock monitor throws pending-state error', () => {
      spyOn(bitcoinProcessor['lockMonitor'], 'getCurrentValueTimeLock').and.callFake(() => {
        throw new SidetreeError(ErrorCode.LockMonitorCurrentValueTimeLockInPendingState);
      });

      try {
        bitcoinProcessor.getActiveValueTimeLockForThisNode();
        fail('Expected exception is not thrown');
      } catch (e) {
        const expectedError = new RequestError(ResponseStatus.NotFound, ErrorCode.ValueTimeLockInPendingState);
        expect(e).toEqual(expectedError);
      }
    });

    it('should bubble up any other errors.', () => {
      spyOn(bitcoinProcessor['lockMonitor'], 'getCurrentValueTimeLock').and.throwError('no lock found.');

      try {
        bitcoinProcessor.getActiveValueTimeLockForThisNode();
        fail('Expected exception is not thrown');
      } catch (e) {
        const expectedError = new RequestError(ResponseStatus.ServerError);
        expect(e).toEqual(expectedError);
      }
    });
  });
});

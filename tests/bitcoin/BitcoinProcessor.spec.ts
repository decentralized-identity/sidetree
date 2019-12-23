import * as httpStatus from 'http-status';
import BitcoinBlockModel from '../../lib/bitcoin/models/BitcoinBlockModel';
import BitcoinClient from '../../lib/bitcoin/BitcoinClient';
import BitcoinDataGenerator from './BitcoinDataGenerator';
import BitcoinOutputModel from '../../lib/bitcoin/models/BitcoinOutputModel';
import BitcoinProcessor, { IBlockInfo } from '../../lib/bitcoin/BitcoinProcessor';
import BitcoinTransactionModel from '../../lib/bitcoin/models/BitcoinTransactionModel';
import ErrorCode from '../../lib/common/SharedErrorCode';
import ServiceVersionModel from '../../lib/common/models/ServiceVersionModel';
import TransactionFeeModel from '../../lib/common/models/TransactionFeeModel';
import TransactionModel from '../../lib/common/models/TransactionModel';
import TransactionNumber from '../../lib/bitcoin/TransactionNumber';
import { IBitcoinConfig } from '../../lib/bitcoin/IBitcoinConfig';
import { Transaction } from 'bitcore-lib';

function randomString (length: number = 16): string {
  return Math.round(Math.random() * Number.MAX_SAFE_INTEGER).toString(16).substring(0, length);
}

function randomNumber (max: number = 256): number {
  return Math.round(Math.random() * max);
}

function randomBlock (above: number = 0): IBlockInfo {
  return { height: above + randomNumber(), hash: randomString() };
}

describe('BitcoinProcessor', () => {
  const testConfig: IBitcoinConfig = {
    bitcoinPeerUri: 'http://localhost:18332',
    bitcoinRpcUsername: 'admin',
    bitcoinRpcPassword: '123456789',
    bitcoinWalletImportString: BitcoinClient.generatePrivateKey('testnet'),
    databaseName: 'bitcoin-test',
    requestTimeoutInMilliseconds: 300,
    genesisBlockNumber: 1480000,
    lowBalanceNoticeInDays: 28,
    requestMaxRetries: 3,
    transactionFetchPageSize: 100,
    mongoDbConnectionString: 'mongodb://localhost:27017',
    sidetreeTransactionPrefix: 'sidetree:',
    transactionPollPeriodInSeconds: 60
  };

  let bitcoinProcessor: BitcoinProcessor;
  let transactionStoreInitializeSpy: jasmine.Spy;
  let quantileCalculatorInitializeSpy: jasmine.Spy;
  let bitcoinClientInitializeSpy: jasmine.Spy;
  let transactionStoreLatestTransactionSpy: jasmine.Spy;
  let getStartingBlockForInitializationSpy: jasmine.Spy;
  let processTransactionsSpy: jasmine.Spy;
  let periodicPollSpy: jasmine.Spy;

  beforeEach(() => {
    bitcoinProcessor = new BitcoinProcessor(testConfig);
    transactionStoreInitializeSpy = spyOn(bitcoinProcessor['transactionStore'], 'initialize');
    quantileCalculatorInitializeSpy = spyOn(bitcoinProcessor['quantileCalculator'], 'initialize');
    bitcoinClientInitializeSpy = spyOn(bitcoinProcessor['bitcoinClient'], 'initialize');

    transactionStoreLatestTransactionSpy = spyOn(bitcoinProcessor['transactionStore'], 'getLastTransaction');
    transactionStoreLatestTransactionSpy.and.returnValue(Promise.resolve(undefined));

    getStartingBlockForInitializationSpy = spyOn(bitcoinProcessor as any, 'getStartingBlockForInitialization');
    getStartingBlockForInitializationSpy.and.returnValue(Promise.resolve(undefined));

    processTransactionsSpy = spyOn(bitcoinProcessor, 'processTransactions' as any);
    processTransactionsSpy.and.returnValue(Promise.resolve({ hash: 'IamAHash', height: 54321 }));
    periodicPollSpy = spyOn(bitcoinProcessor, 'periodicPoll' as any);
  });

  function createTransactions (count?: number, height?: number): TransactionModel[] {
    const transactions: TransactionModel[] = [];
    if (!count) {
      count = randomNumber(9) + 1;
    }
    if (!height) {
      height = randomNumber();
    }
    const hash = randomString();
    const feePaidRandom = randomNumber();

    for (let i = 0; i < count; i++) {
      transactions.push({
        transactionNumber: TransactionNumber.construct(height, i),
        transactionTime: height,
        transactionTimeHash: hash,
        anchorString: randomString(),
        transactionFeePaid: feePaidRandom,
        normalizedTransactionFee: feePaidRandom
      });
    }
    return transactions;
  }

  describe('constructor', () => {
    it('should use appropriate config values', () => {
      const config: IBitcoinConfig = {
        bitcoinPeerUri: randomString(),
        bitcoinRpcUsername: 'admin',
        bitcoinRpcPassword: 'password123',
        bitcoinWalletImportString: BitcoinClient.generatePrivateKey('testnet'),
        databaseName: randomString(),
        genesisBlockNumber: randomNumber(),
        transactionFetchPageSize: randomNumber(),
        mongoDbConnectionString: randomString(),
        sidetreeTransactionPrefix: randomString(4),
        lowBalanceNoticeInDays: undefined,
        requestTimeoutInMilliseconds: undefined,
        requestMaxRetries: undefined,
        transactionPollPeriodInSeconds: undefined
      };

      const bitcoinProcessor = new BitcoinProcessor(config);
      expect(bitcoinProcessor.genesisBlockNumber).toEqual(config.genesisBlockNumber);
      expect(bitcoinProcessor.lowBalanceNoticeDays).toEqual(28);
      expect(bitcoinProcessor.pageSize).toEqual(config.transactionFetchPageSize);
      expect(bitcoinProcessor.pollPeriod).toEqual(60);
      expect(bitcoinProcessor.sidetreePrefix).toEqual(config.sidetreeTransactionPrefix);
      expect(bitcoinProcessor['transactionStore'].databaseName).toEqual(config.databaseName!);
      expect(bitcoinProcessor['transactionStore']['serverUrl']).toEqual(config.mongoDbConnectionString);
    });

    it('should throw if the wallet import string is incorrect', () => {
      const config: IBitcoinConfig = {
        bitcoinPeerUri: randomString(),
        bitcoinRpcUsername: 'admin',
        bitcoinRpcPassword: '1234',
        bitcoinWalletImportString: 'wrong!',
        databaseName: randomString(),
        genesisBlockNumber: randomNumber(),
        transactionFetchPageSize: randomNumber(),
        mongoDbConnectionString: randomString(),
        sidetreeTransactionPrefix: randomString(4),
        lowBalanceNoticeInDays: undefined,
        requestTimeoutInMilliseconds: undefined,
        requestMaxRetries: undefined,
        transactionPollPeriodInSeconds: undefined
      };

      try {
        /* tslint:disable-next-line:no-unused-expression */
        new BitcoinProcessor(config);
        fail('expected to throw');
      } catch (error) {
        expect(error.message).toContain('Failed creating private key');
      }
    });
  });

  describe('initialize', () => {

    beforeEach(async () => {
      quantileCalculatorInitializeSpy.and.returnValue(Promise.resolve(undefined));
      bitcoinClientInitializeSpy.and.returnValue(Promise.resolve());
      getStartingBlockForInitializationSpy.and.returnValue(Promise.resolve({ height: 123, hash: 'hash' }));
    });

    it('should initialize the internal objects', async (done) => {
      expect(transactionStoreInitializeSpy).not.toHaveBeenCalled();
      expect(quantileCalculatorInitializeSpy).not.toHaveBeenCalled();
      expect(bitcoinClientInitializeSpy).not.toHaveBeenCalled();

      await bitcoinProcessor.initialize();

      expect(transactionStoreInitializeSpy).toHaveBeenCalled();
      expect(quantileCalculatorInitializeSpy).toHaveBeenCalledWith();
      expect(bitcoinClientInitializeSpy).toHaveBeenCalled();
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
      const spy = spyOn(bitcoinProcessor['bitcoinClient'], 'getBlock');
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
      const spy = spyOn(bitcoinProcessor['bitcoinClient'], 'getBlockHeight');
      spy.and.returnValue(Promise.resolve(height));

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
    it('should get transactions since genesis limited by page size', async (done) => {
      const verifyMock = spyOn(bitcoinProcessor, 'verifyBlock' as any);
      const transactions = createTransactions();
      const laterThanMock = spyOn(bitcoinProcessor['transactionStore'], 'getTransactionsLaterThan').and.callFake(((since: number, pages: number) => {
        expect(since).toBeUndefined();
        expect(pages).toEqual(testConfig.transactionFetchPageSize);
        return Promise.resolve(transactions);
      }));

      const actual = await bitcoinProcessor.transactions();
      expect(verifyMock).not.toHaveBeenCalled();
      expect(laterThanMock).toHaveBeenCalled();
      expect(actual.moreTransactions).toBeFalsy();
      expect(actual.transactions).toEqual(transactions);
      done();
    });

    it('should get transactions since a specific block height and hash', async (done) => {
      const expectedHeight = randomNumber();
      const expectedHash = randomString();
      const expectedTransactionNumber = TransactionNumber.construct(expectedHeight, 0);
      const verifyMock = spyOn(bitcoinProcessor, 'verifyBlock' as any).and.callFake((height: number, hash: string) => {
        expect(height).toEqual(expectedHeight);
        expect(hash).toEqual(expectedHash);
        return Promise.resolve(true);
      });
      const transactions = createTransactions(undefined, expectedHeight);
      const laterThanMock = spyOn(bitcoinProcessor['transactionStore'], 'getTransactionsLaterThan').and.callFake(((since: number) => {
        expect(since).toEqual(TransactionNumber.construct(expectedHeight, 0));
        return Promise.resolve(transactions);
      }));

      const actual = await bitcoinProcessor.transactions(expectedTransactionNumber, expectedHash);
      expect(verifyMock).toHaveBeenCalled();
      expect(laterThanMock).toHaveBeenCalled();
      expect(actual.moreTransactions).toBeFalsy();
      expect(actual.transactions).toEqual(transactions);
      done();
    });

    it('should fail if only given a block height', async (done) => {
      try {
        await bitcoinProcessor.transactions(randomNumber());
        fail('expected to throw');
      } catch (error) {
        expect(error.status).toEqual(httpStatus.BAD_REQUEST);
        expect(error.code).not.toEqual(ErrorCode.InvalidTransactionNumberOrTimeHash);
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
        expect(error.code).toEqual(ErrorCode.InvalidTransactionNumberOrTimeHash);
        expect(verifyMock).toHaveBeenCalled();
      } finally {
        done();
      }
    });

    it('should handle moreTransactions parameter according to the returned page size', async (done) => {
      const expectedHeight = randomNumber();
      const expectedHash = randomString();
      const expectedTransactionNumber = TransactionNumber.construct(expectedHeight, 0);
      const verifyMock = spyOn(bitcoinProcessor, 'verifyBlock' as any).and.returnValue(Promise.resolve(true));
      const transactions = createTransactions(testConfig.transactionFetchPageSize, expectedHeight);
      const laterThanMock = spyOn(bitcoinProcessor['transactionStore'], 'getTransactionsLaterThan').and.returnValue(Promise.resolve(transactions));
      const actual = await bitcoinProcessor.transactions(expectedTransactionNumber, expectedHash);
      expect(verifyMock).toHaveBeenCalled();
      expect(laterThanMock).toHaveBeenCalled();
      expect(actual.transactions).toEqual(transactions);
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
          normalizedTransactionFee: feePaidRandom
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
    it('should write a transaction if there are enough Satoshis', async (done) => {
      const getCoinsSpy = spyOn(bitcoinProcessor['bitcoinClient'], 'getBalanceInSatoshis').and.returnValue(Promise.resolve(lowLevelWarning + 1));
      const hash = randomString();
      const broadcastSpy = spyOn(bitcoinProcessor['bitcoinClient'], 'broadcastTransaction' as any).and.returnValue(Promise.resolve(true));

      await bitcoinProcessor.writeTransaction(hash, bitcoinFee);
      expect(getCoinsSpy).toHaveBeenCalled();
      expect(broadcastSpy).toHaveBeenCalled();
      done();
    });

    it('should warn if the number of Satoshis are under the lowBalance calculation', async (done) => {
      const getCoinsSpy = spyOn(bitcoinProcessor['bitcoinClient'], 'getBalanceInSatoshis').and.returnValue(Promise.resolve(lowLevelWarning - 1));
      const hash = randomString();
      const broadcastSpy = spyOn(bitcoinProcessor['bitcoinClient'], 'broadcastTransaction' as any).and.returnValue(Promise.resolve(true));
      const errorSpy = spyOn(global.console, 'error').and.callFake((message: string) => {
        expect(message).toContain('fund your wallet');
      });
      await bitcoinProcessor.writeTransaction(hash, bitcoinFee);
      expect(getCoinsSpy).toHaveBeenCalled();
      expect(broadcastSpy).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();
      done();
    });

    it('should fail if there are not enough satoshis to create a transaction', async (done) => {
      const getCoinsSpy = spyOn(bitcoinProcessor['bitcoinClient'], 'getBalanceInSatoshis').and.returnValue(Promise.resolve(0));
      const hash = randomString();
      const broadcastSpy = spyOn(bitcoinProcessor['bitcoinClient'], 'broadcastTransaction' as any).and.callFake(() => {
        fail('writeTransaction should have stopped before calling broadcast');
      });
      try {
        await bitcoinProcessor.writeTransaction(hash, 4000);
        fail('should have thrown');
      } catch (error) {
        expect(error.message).toContain('Not enough satoshis');
        expect(getCoinsSpy).toHaveBeenCalled();
        expect(broadcastSpy).not.toHaveBeenCalled();
      } finally {
        done();
      }
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
        expect(error.code).toEqual(ErrorCode.BlockchainTimeOutOfRange);
      }
    });

    it('should throw if the the quantile calculator does not return a value.', async () => {
      spyOn(bitcoinProcessor['quantileCalculator'], 'getQuantile').and.returnValue(undefined);

      try {
        await bitcoinProcessor.getNormalizedFee(validBlockHeight);
        fail('should have failed');
      } catch (error) {
        expect(error.status).toEqual(httpStatus.BAD_REQUEST);
        expect(error.code).toEqual(ErrorCode.BlockchainTimeOutOfRange);
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
        await bitcoinProcessor['processTransactions']({ height: testConfig.genesisBlockNumber - 10, hash: randomString() });
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
        await bitcoinProcessor['processTransactions']({ height: testConfig.genesisBlockNumber - 1, hash: randomString() });
        fail('should have thrown');
      } catch (error) {
        expect(error.message).toContain('before genesis');
        expect(processMock).not.toHaveBeenCalled();
      } finally {
        done();
      }
    });
  });

  describe('getStartingBlockForInitialization', () => {

    beforeEach(() => {
      getStartingBlockForInitializationSpy.and.callThrough();
    });

    it('should return the genesis block if no quantile is saved in the db', async (done) => {
      const getLastGroupIdSpy = spyOn(bitcoinProcessor['quantileCalculator'], 'getLastGroupId');
      const removeGroupSpy = spyOn(bitcoinProcessor['quantileCalculator'], 'removeGroupsGreaterThanOrEqual');
      const removeTxnsSpy = spyOn(bitcoinProcessor['transactionStore'], 'removeTransactionsLaterThan');

      const mockStartingBlockHash = 'some_hash';
      const mockStartingBlockFirstTxn = 987654321;

      getLastGroupIdSpy.and.returnValue(Promise.resolve(undefined)); // simulate that nothing is saved
      removeGroupSpy.and.returnValue(Promise.resolve(undefined));
      removeTxnsSpy.and.returnValue(Promise.resolve(undefined));
      spyOn(TransactionNumber, 'construct').and.returnValue(mockStartingBlockFirstTxn);
      spyOn(bitcoinProcessor['bitcoinClient'], 'getBlockHash').and.returnValue(Promise.resolve(mockStartingBlockHash));

      const startingBlock = await bitcoinProcessor['getStartingBlockForInitialization']();
      expect(startingBlock.height).toEqual(bitcoinProcessor['genesisBlockNumber']);
      expect(startingBlock.hash).toEqual(mockStartingBlockHash);
      done();
    });

    it('should remove the correct group and block info from the db', async (done) => {
      const getLastGroupIdSpy = spyOn(bitcoinProcessor['quantileCalculator'], 'getLastGroupId');
      const removeGroupSpy = spyOn(bitcoinProcessor['quantileCalculator'], 'removeGroupsGreaterThanOrEqual');
      const removeTxnsSpy = spyOn(bitcoinProcessor['transactionStore'], 'removeTransactionsLaterThan');

      const mockLastGroupId = 1345;
      const mockStartingBlockHeight = 10000;
      const mockStartingBlockHash = 'some_hash';
      const mockStartingBlockFirstTxn = 987654321;

      getLastGroupIdSpy.and.returnValue(Promise.resolve(mockLastGroupId));
      removeGroupSpy.and.returnValue(Promise.resolve(undefined));
      removeTxnsSpy.and.returnValue(Promise.resolve(undefined));
      spyOn(bitcoinProcessor as any, 'getStartingBlockFromGroupId').and.returnValue(mockStartingBlockHeight);
      spyOn(bitcoinProcessor['bitcoinClient'], 'getBlockHash').and.returnValue(Promise.resolve(mockStartingBlockHash));
      spyOn(TransactionNumber, 'construct').and.returnValue(mockStartingBlockFirstTxn);

      const actualBlock = await bitcoinProcessor['getStartingBlockForInitialization']();

      expect(removeGroupSpy).toHaveBeenCalledWith(mockLastGroupId);
      expect(removeTxnsSpy).toHaveBeenCalledWith(mockStartingBlockFirstTxn - 1);

      expect(actualBlock.height).toEqual(mockStartingBlockHeight);
      expect(actualBlock.hash).toEqual(mockStartingBlockHash);
      done();
    });
  });

  describe('getStartingBlockForPeriodicPoll', () => {
    let actualLastProcessedBlock: IBlockInfo;

    beforeEach(() => {
      bitcoinProcessor['lastProcessedBlock'] = { height: randomNumber(), hash: randomString() };
      actualLastProcessedBlock = bitcoinProcessor['lastProcessedBlock'];
      expect(actualLastProcessedBlock).toBeDefined();
    });

    it('should return the block after the last-processed-block', async () => {
      spyOn(bitcoinProcessor as any, 'verifyBlock').and.returnValue(Promise.resolve(true));
      spyOn(bitcoinProcessor['bitcoinClient'], 'getCurrentBlockHeight').and.returnValue(Promise.resolve(actualLastProcessedBlock.height + 1));
      spyOn(bitcoinProcessor['bitcoinClient'], 'getBlockHash').and.returnValue(Promise.resolve('some_hash'));

      const actual = await bitcoinProcessor['getStartingBlockForPeriodicPoll']();
      expect(actual).toBeDefined();
      expect(actual!.height).toEqual(actualLastProcessedBlock.height + 1);
    });

    it('should return undefined if the last-processed-block is same as the current height', async () => {
      spyOn(bitcoinProcessor as any, 'verifyBlock').and.returnValue(Promise.resolve(true));
      spyOn(bitcoinProcessor['bitcoinClient'], 'getCurrentBlockHeight').and.returnValue(Promise.resolve(actualLastProcessedBlock.height));
      spyOn(bitcoinProcessor['bitcoinClient'], 'getBlockHash').and.returnValue(Promise.resolve('some_hash'));

      const actual = await bitcoinProcessor['getStartingBlockForPeriodicPoll']();
      expect(actual).not.toBeDefined();
    });

    it('should revert blockchain if verifyblock fails', async () => {
      const mockHeightAfterRevert = actualLastProcessedBlock.height - 1;

      const revertBlockchainSpy = spyOn(bitcoinProcessor as any, 'revertBlockchainCache');
      revertBlockchainSpy.and.returnValue({ height: mockHeightAfterRevert, hash: randomString() });

      spyOn(bitcoinProcessor as any, 'verifyBlock').and.returnValue(Promise.resolve(false));
      spyOn(bitcoinProcessor['bitcoinClient'], 'getCurrentBlockHeight').and.returnValue(Promise.resolve(actualLastProcessedBlock.height + 1));
      spyOn(bitcoinProcessor['bitcoinClient'], 'getBlockHash').and.returnValue(Promise.resolve('some_hash'));

      const actual = await bitcoinProcessor['getStartingBlockForPeriodicPoll']();
      expect(actual).toBeDefined();
      expect(actual!.height).toEqual(mockHeightAfterRevert + 1);
      expect(revertBlockchainSpy).toHaveBeenCalled();
    });
  });

  describe('revertBlockchainCache', () => {
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
      const removeTransactions = spyOn(bitcoinProcessor['transactionStore'],
        'removeTransactionsLaterThan').and.returnValue(Promise.resolve());
      const revertQuantileState = spyOn(bitcoinProcessor['quantileCalculator'], 'removeGroupsGreaterThanOrEqual').and.callFake((_groupId): Promise<void> => {
        // Make sure that that this call is made BEFORE the transaction-store call.
        expect(removeTransactions.calls.count()).toEqual(0);

        return Promise.resolve();
      });
      const getFirstBlockInGroupSpy = spyOn(bitcoinProcessor, 'getFirstBlockInGroup' as any).and.callFake((block: number) => {
        return block;
      });

      const mockHash = 'mock_hash';
      spyOn(bitcoinProcessor['bitcoinClient'],'getBlockHash' as any).and.returnValue(Promise.resolve(mockHash));

      const actual = await bitcoinProcessor['revertBlockchainCache']();
      expect(actual.height).toEqual(transactions[1].transactionTime);
      expect(actual.hash).toEqual(mockHash);
      expect(transactionCount).toHaveBeenCalled();
      expect(exponentialTransactions).toHaveBeenCalled();
      expect(firstValid).toHaveBeenCalled();
      expect(removeTransactions).toHaveBeenCalled();
      expect(revertQuantileState).toHaveBeenCalled();
      expect(getFirstBlockInGroupSpy).toHaveBeenCalled();
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
      const revertQuantileState = spyOn(bitcoinProcessor['quantileCalculator'], 'removeGroupsGreaterThanOrEqual').and.returnValue(Promise.resolve());
      const getFirstBlockInGroupSpy = spyOn(bitcoinProcessor, 'getFirstBlockInGroup' as any).and.callFake((block: number) => {
        return block;
      });

      const mockHash = 'mock_hash';
      spyOn(bitcoinProcessor['bitcoinClient'],'getBlockHash' as any).and.returnValue(Promise.resolve(mockHash));

      const actual = await bitcoinProcessor['revertBlockchainCache']();
      expect(actual.height).toEqual(transactions[0].transactionTime);
      expect(actual.hash).toEqual(mockHash);
      expect(transactionCount).toHaveBeenCalledTimes(2);
      expect(exponentialTransactions).toHaveBeenCalledTimes(2);
      expect(firstValid).toHaveBeenCalledTimes(2);
      expect(removeTransactions).toHaveBeenCalledTimes(2);
      expect(revertQuantileState).toHaveBeenCalled();
      expect(getFirstBlockInGroupSpy).toHaveBeenCalled();
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

      const mockHash = 'mock_hash';
      spyOn(bitcoinProcessor['bitcoinClient'],'getBlockHash' as any).and.returnValue(Promise.resolve(mockHash));

      const actual = await bitcoinProcessor['revertBlockchainCache']();
      expect(actual.height).toEqual(testConfig.genesisBlockNumber);
      expect(actual.hash).toEqual(mockHash);
      expect(transactionCount).toHaveBeenCalled();
      expect(exponentialTransactions).toHaveBeenCalled();
      expect(firstValid).toHaveBeenCalled();
      expect(removeTransactions).toHaveBeenCalled();
      done();
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

  describe('getStartingBlockFromGroupId', () => {
    it('should round the value correctly', async () => {
      // The expected values are dependent upon the protocol-parameters.json so if those values
      // are changed, these expected value may as well

      const actualBlock = bitcoinProcessor['getStartingBlockFromGroupId'](152);
      expect(actualBlock).toEqual(15200);
    });
  });

  describe('verifyBlock', () => {
    it('should return true if the hash matches given a block height', async (done) => {
      const height = randomNumber();
      const hash = randomString();
      const mock = spyOn(bitcoinProcessor['bitcoinClient'], 'getBlockHash' as any).and.returnValue(hash);
      const actual = await bitcoinProcessor['verifyBlock'](height, hash);
      expect(actual).toBeTruthy();
      expect(mock).toHaveBeenCalled();
      done();
    });

    it('should return false if the hash does not match given a block height', async (done) => {
      const height = randomNumber();
      const hash = randomString();
      const mock = spyOn(bitcoinProcessor['bitcoinClient'], 'getBlockHash' as any).and.returnValue(randomString());
      const actual = await bitcoinProcessor['verifyBlock'](height, hash);
      expect(actual).toBeFalsy();
      expect(mock).toHaveBeenCalled();
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

      return {
        hash: randomString(),
        height: blockHeight,
        transactions: tx.map((txn) => { return BitcoinClient['createBitcoinTransactionModel'](txn); })
      };
    }

    it('should review all transactions in a block and add them to the transactionStore', async (done) => {
      const block = randomNumber();
      const blockHash = randomString();
      const blockData: BitcoinBlockModel = {
        height: block,
        hash: blockHash,
        transactions: [
          { id: 'id', inputs: [], outputs: [] },
          { id: 'id2', inputs: [], outputs: [] }
        ]
      };

      const pofCalcSpy = spyOn(bitcoinProcessor, 'processBlockForPofCalculation' as any).and.returnValue(Promise.resolve());
      spyOn(bitcoinProcessor['bitcoinClient'], 'getBlockHash' as any).and.returnValue(blockHash);
      spyOn(bitcoinProcessor['bitcoinClient'], 'getBlock').and.returnValue(Promise.resolve(blockData));

      const mockSidetreeTxnModels: TransactionModel[] = [
        // tslint:disable-next-line: max-line-length
        { anchorString: 'anchor1', transactionTimeHash: 'timehash1', transactionTime: 100, transactionNumber: 200, transactionFeePaid: 300, normalizedTransactionFee: 400 },
        // tslint:disable-next-line: max-line-length
        { anchorString: 'anchor2', transactionTimeHash: 'timehash2', transactionTime: 150, transactionNumber: 250, transactionFeePaid: 350, normalizedTransactionFee: 450 }
      ];

      // Return the mock values one-by-one in order
      let getSidetreeTxnCallIndex = 0;
      spyOn(bitcoinProcessor as any,'getValidSidetreeTransactionFromOutputs').and.callFake(() => {
        const retValue = mockSidetreeTxnModels[getSidetreeTxnCallIndex];
        getSidetreeTxnCallIndex++;

        return Promise.resolve(retValue);
      });

      // Verify that the add transaction is called with the correct values
      let addTxnCallIndex = 0;
      const addTransaction = spyOn(bitcoinProcessor['transactionStore'], 'addTransaction').and.callFake((sidetreeTransaction: TransactionModel) => {
        expect(sidetreeTransaction).toEqual(mockSidetreeTxnModels[addTxnCallIndex]);
        addTxnCallIndex++;
        return Promise.resolve(undefined);
      });

      const actual = await bitcoinProcessor['processBlock'](block);
      expect(actual).toEqual(blockData.hash);
      expect(pofCalcSpy).toHaveBeenCalled();
      expect(addTransaction).toHaveBeenCalled();
      expect(addTxnCallIndex).toEqual(2);

      done();
    });

    it('should not add anything to the transaction store if no sidetree transaction is found.', async (done) => {
      const block = randomNumber();
      const blockHash = randomString();
      const blockData: BitcoinBlockModel = {
        height: block,
        hash: blockHash,
        transactions: [
          { id: 'id', inputs: [], outputs: [] },
          { id: 'id2', inputs: [], outputs: [] }
        ]
      };

      const pofCalcSpy = spyOn(bitcoinProcessor, 'processBlockForPofCalculation' as any).and.returnValue(Promise.resolve());
      spyOn(bitcoinProcessor['bitcoinClient'], 'getBlockHash' as any).and.returnValue(blockHash);
      spyOn(bitcoinProcessor['bitcoinClient'], 'getBlock').and.returnValue(Promise.resolve(blockData));
      spyOn(bitcoinProcessor as any,'getSidetreeDataFromVOutIfExist').and.returnValue(undefined);

      const addTransactionSpy = spyOn(bitcoinProcessor['transactionStore'], 'addTransaction');

      const actual = await bitcoinProcessor['processBlock'](block);
      expect(actual).toEqual(blockData.hash);
      expect(pofCalcSpy).toHaveBeenCalled();
      expect(addTransactionSpy).not.toHaveBeenCalled();

      done();
    });

    describe('processBlockForPofCalculation', async () => {
      it('should only add the non-sidetree transactions to the sampler.', async (done) => {
        const block = randomNumber();
        let numOfNonSidetreeTransactions = 0;
        let firstTransaction = true;
        const blockData = await generateBlock(block, () => {
          if (firstTransaction) {
            // First transaction is always ignored so we are returning
            // some random data that has no effect on the processing overall
            firstTransaction = false;
            return randomString();
          }

          if (Math.random() > 0.8) {
            const id = randomString();
            return testConfig.sidetreeTransactionPrefix + id;
          }

          numOfNonSidetreeTransactions++;
          return randomString();
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

  describe('isSidetreeTransaction', async () => {
    it('should return true if at least 1 output has sidetree data', async (done) => {
      const mockTxnModel: BitcoinTransactionModel = {
        id: 'id',
        inputs: [],
        outputs: [
          { satoshis: 100, scriptAsmAsString: 'script' },
          { satoshis: 200, scriptAsmAsString: 'script2' }
        ]
      };

      // Only return true for the 2nd call
      let getSidetreeDataCallIndex = 0;
      spyOn(bitcoinProcessor as any, 'getSidetreeDataFromVOutIfExist').and.callFake(() => {
        getSidetreeDataCallIndex++;

        if (getSidetreeDataCallIndex === 2) {
          return randomString();
        }
        return undefined;
      });

      const result = bitcoinProcessor['isSidetreeTransaction'](mockTxnModel);
      expect(result).toBeTruthy();
      done();
    });

    it('should return false if no output has sidetree data', async (done) => {
      const mockTxnModel: BitcoinTransactionModel = {
        id: 'id',
        inputs: [],
        outputs: [
          { satoshis: 100, scriptAsmAsString: 'script' },
          { satoshis: 200, scriptAsmAsString: 'script2' }
        ]
      };

      spyOn(bitcoinProcessor as any, 'getSidetreeDataFromVOutIfExist').and.returnValue(undefined);

      const result = bitcoinProcessor['isSidetreeTransaction'](mockTxnModel);
      expect(result).toBeFalsy();
      done();
    });
  });

  describe('getSidetreeDataFromVOutIfExist', async () => {
    it('should return the data if the valid sidetree transaction exist', async (done) => {
      const sidetreeData = 'some test data';
      const sidetreeDataWithPrefix = testConfig.sidetreeTransactionPrefix + sidetreeData;
      const sidetreeDataWithPrefixInHex = Buffer.from(sidetreeDataWithPrefix).toString('hex');

      const validOpReturn = `OP_RETURN ${sidetreeDataWithPrefixInHex}`;

      const mockOutput: BitcoinOutputModel = { satoshis:  0, scriptAsmAsString: validOpReturn };

      const actual = bitcoinProcessor['getSidetreeDataFromVOutIfExist'](mockOutput);
      expect(actual).toBeDefined();
      expect(actual!).toEqual(sidetreeData);
      done();
    });

    it('should return undefined if no valid sidetree transaction exist', async (done) => {
      const mockOutput: BitcoinOutputModel = { satoshis:  0, scriptAsmAsString: 'some random data' };

      const actual = bitcoinProcessor['getSidetreeDataFromVOutIfExist'](mockOutput);
      expect(actual).not.toBeDefined();
      done();
    });
  });

  describe('getValidSidetreeTransactionFromOutputs', async () => {
    it('should only return the sidetree transaction if only a single sidetree transaction exist.', async (done) => {

      const mockOutputs: BitcoinOutputModel[] = [
        { satoshis:  0, scriptAsmAsString: 'some random data' },
        { satoshis:  0, scriptAsmAsString: 'some random data 2' }
      ];

      const mockSidetreeData = 'some test data';
      // Mock the getSidetreeData function to only return ONE valid transaction
      let callIndex = 0;
      spyOn(bitcoinProcessor as any, 'getSidetreeDataFromVOutIfExist').and.callFake((_: BitcoinOutputModel) => {

        // Only return a valid sidetree data for the 2nd call
        if (callIndex === 1) {
          return mockSidetreeData;
        }

        callIndex++;
        return undefined;
      });

      const mockTxnFee = 1000;
      const mockNormalizedFeeModel: TransactionFeeModel = { normalizedTransactionFee: 300 };

      const getTxnFeeSpy = spyOn(bitcoinProcessor['bitcoinClient'], 'getTransactionFeeInSatoshis').and.returnValue(Promise.resolve(mockTxnFee));
      const getNormalizedFeeSpy = spyOn(bitcoinProcessor, 'getNormalizedFee').and.returnValue(Promise.resolve(mockNormalizedFeeModel));

      const mockTxnNumber = 1000;
      spyOn(TransactionNumber, 'construct').and.returnValue(1000);

      const mockTxnBlock = 20;
      const mockTxnHash = 'hash';
      const mockTxnId = 'transaction id';

      const mockOutputTxnModel: TransactionModel = {
        anchorString: mockSidetreeData,
        normalizedTransactionFee: mockNormalizedFeeModel.normalizedTransactionFee,
        transactionFeePaid: mockTxnFee,
        transactionNumber: mockTxnNumber,
        transactionTime: mockTxnBlock,
        transactionTimeHash: mockTxnHash
      };

      const output = await bitcoinProcessor['getValidSidetreeTransactionFromOutputs'](mockOutputs, 10, mockTxnBlock, mockTxnHash, mockTxnId);
      expect(output).toBeDefined();
      expect(output).toEqual(mockOutputTxnModel);
      expect(getTxnFeeSpy).toHaveBeenCalled();
      expect(getNormalizedFeeSpy).toHaveBeenCalled();

      done();
    });

    it('should return undefined if there are multiple sidetree transaction in the outputs.', async (done) => {

      const mockOutputs: BitcoinOutputModel[] = [
        { satoshis:  0, scriptAsmAsString: 'some random data' },
        { satoshis:  0, scriptAsmAsString: 'some random data 2' }
      ];

      // Mock the getSidetreeData function to only return more than one sidetree transaction
      spyOn(bitcoinProcessor as any, 'getSidetreeDataFromVOutIfExist').and.returnValue(randomString());

      const getTxnFeeSpy = spyOn(bitcoinProcessor['bitcoinClient'], 'getTransactionFeeInSatoshis');
      const getNormalizedFeeSpy = spyOn(bitcoinProcessor, 'getNormalizedFee');

      const output = await bitcoinProcessor['getValidSidetreeTransactionFromOutputs'](mockOutputs, 10, 20, 'hash', 'id');
      expect(output).not.toBeDefined();
      expect(getTxnFeeSpy).not.toHaveBeenCalled();
      expect(getNormalizedFeeSpy).not.toHaveBeenCalled();

      done();
    });

    it('should return undefined if there are no outputs', async (done) => {
      const output = await bitcoinProcessor['getValidSidetreeTransactionFromOutputs']([], 10, 20, 'hash', 'id');
      expect(output).not.toBeDefined();
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
});

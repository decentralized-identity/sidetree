import * as httpStatus from 'http-status';
import BlockData from '../../lib/bitcoin/models/BlockData';
import BitcoinDataGenerator from './BitcoinDataGenerator';
import BitcoinProcessor, { IBlockInfo } from '../../lib/bitcoin/BitcoinProcessor';
import ErrorCode from '../../lib/common/SharedErrorCode';
import ServiceVersionModel from '../../lib/common/models/ServiceVersionModel';
import TransactionModel from '../../lib/common/models/TransactionModel';
import TransactionNumber from '../../lib/bitcoin/TransactionNumber';
import { IBitcoinConfig } from '../../lib/bitcoin/IBitcoinConfig';
import { Block, PrivateKey, Transaction } from 'bitcore-lib';

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
    bitcoinWalletImportString: BitcoinProcessor.generatePrivateKey('testnet'),
    bitcoinFeeSpendingCutoffPerPeriod: 6,
    bitcoinFeeSpendingCutoffPeriodInBlocks: 1,
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

  const privateKey: PrivateKey = (PrivateKey as any).fromWIF(testConfig.bitcoinWalletImportString);

  let bitcoinProcessor: BitcoinProcessor;
  let transactionStoreInitializeSpy: jasmine.Spy;
  let transactionStoreLatestTransactionSpy: jasmine.Spy;
  let processTransactionsSpy: jasmine.Spy;
  let periodicPollSpy: jasmine.Spy;

  beforeEach(() => {
    bitcoinProcessor = new BitcoinProcessor(testConfig);
    transactionStoreInitializeSpy = spyOn(bitcoinProcessor['transactionStore'], 'initialize');
    transactionStoreLatestTransactionSpy = spyOn(bitcoinProcessor['transactionStore'], 'getLastTransaction');
    transactionStoreLatestTransactionSpy.and.returnValue(Promise.resolve(undefined));
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
        bitcoinWalletImportString: BitcoinProcessor.generatePrivateKey('testnet'),
        bitcoinFeeSpendingCutoffPerPeriod: randomNumber(),
        bitcoinFeeSpendingCutoffPeriodInBlocks: randomNumber(),
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
        bitcoinFeeSpendingCutoffPerPeriod: randomNumber(),
        bitcoinFeeSpendingCutoffPeriodInBlocks: randomNumber(),
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

    let walletExistsSpy: jasmine.Spy;

    beforeEach(async () => {
      walletExistsSpy = spyOn(bitcoinProcessor['bitcoinLedger'], 'walletExists' as any);
    });

    it('should initialize the transactionStore', async (done) => {
      walletExistsSpy.and.returnValue(Promise.resolve(true));
      expect(transactionStoreInitializeSpy).not.toHaveBeenCalled();
      await bitcoinProcessor.initialize();
      expect(transactionStoreInitializeSpy).toHaveBeenCalled();
      done();
    });

    it('should process all the blocks since its last known', async (done) => {
      walletExistsSpy.and.returnValue(Promise.resolve(true));
      const fromNumber = randomNumber();
      const fromHash = randomString();
      transactionStoreLatestTransactionSpy.and.returnValue(
        Promise.resolve({
          transactionNumber: randomNumber(),
          transactionTime: fromNumber,
          transactionTimeHash: fromHash,
          anchorString: randomString()
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
      expect(processTransactionsSpy).not.toHaveBeenCalled();
      expect(transactionStoreLatestTransactionSpy).not.toHaveBeenCalled();
      await bitcoinProcessor.initialize();
      expect(processTransactionsSpy).toHaveBeenCalled();
      expect(transactionStoreLatestTransactionSpy).toHaveBeenCalled();
      done();
    });

    it('should begin to periodically poll for updates', async (done) => {
      walletExistsSpy.and.returnValue(Promise.resolve(true));
      expect(periodicPollSpy).not.toHaveBeenCalled();
      await bitcoinProcessor.initialize();
      expect(periodicPollSpy).toHaveBeenCalled();
      done();
    });

    it('should import key if the wallet does not exist', async () => {
      walletExistsSpy.and.returnValue(Promise.resolve(false));
      const publicKeyHex = privateKey.toPublicKey().toBuffer().toString('hex');
      const importSpy = spyOn(bitcoinProcessor['bitcoinLedger'], 'importPublicKey').and.callFake((key, rescan) => {
        expect(key).toEqual(publicKeyHex);
        expect(rescan).toBeTruthy();

        return Promise.resolve(undefined);
      });

      await bitcoinProcessor.initialize();
      expect(walletExistsSpy).toHaveBeenCalled();
      expect(importSpy).toHaveBeenCalled();
    });
  });

  describe('generatePrivateKey', () => {
    it('should construct a PrivateKey and export its WIF', () => {
      const privateKey = BitcoinProcessor.generatePrivateKey('mainnet');
      expect(privateKey).toBeDefined();
      expect(typeof privateKey).toEqual('string');
      expect(privateKey.length).toBeGreaterThan(0);
      expect(() => {
        (PrivateKey as any).fromWIF(privateKey);
      }).not.toThrow();
    });
  });

  describe('time', () => {
    it('should get the current latest when given no hash', async (done) => {
      const height = randomNumber();
      const hash = randomString();
      const tipSpy = spyOn(bitcoinProcessor['bitcoinLedger'], 'getCurrentBlockHeight' as any).and.returnValue(Promise.resolve(height));
      const hashSpy = spyOn(bitcoinProcessor['bitcoinLedger'], 'getBlockHash' as any).and.returnValue(Promise.resolve(hash));
      const spy = spyOn(bitcoinProcessor['bitcoinLedger'], 'getBlock');
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
      const block: Block = {
        hash: hash,
        height: height,
        transactions: [],
        header: {
          prevHash: 'previous_hash',
          time: 1234
        }
      };

      const tipSpy = spyOn(bitcoinProcessor['bitcoinLedger'], 'getCurrentBlockHeight' as any).and.returnValue(Promise.resolve(height));
      const hashSpy = spyOn(bitcoinProcessor['bitcoinLedger'], 'getBlockHash' as any).and.returnValue(Promise.resolve(hash));
      const spy = spyOn(bitcoinProcessor['bitcoinLedger'], 'getBlock');
      spy.and.returnValue(Promise.resolve(block));

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
      const getCoinsSpy = spyOn(bitcoinProcessor['bitcoinLedger'], 'getUnspentCoins' as any).and.returnValue(Promise.resolve([
        BitcoinDataGenerator.generateUnspentCoin(testConfig.bitcoinWalletImportString, lowLevelWarning + 1)
      ]));
      const hash = randomString();
      const broadcastSpy = spyOn(bitcoinProcessor['bitcoinLedger'], 'broadcastTransaction' as any).and.callFake((transaction: Transaction) => {
        expect(transaction.getFee()).toEqual(bitcoinFee);
        expect(transaction.outputs[0].script.getData()).toEqual(Buffer.from(testConfig.sidetreeTransactionPrefix + hash));
        return Promise.resolve(true);
      });
      await bitcoinProcessor.writeTransaction(hash, bitcoinFee);
      expect(getCoinsSpy).toHaveBeenCalled();
      expect(broadcastSpy).toHaveBeenCalled();
      done();
    });

    it('should warn if the number of Satoshis are under the lowBalance calculation', async (done) => {
      const getCoinsSpy = spyOn(bitcoinProcessor['bitcoinLedger'], 'getUnspentCoins' as any).and.returnValue(Promise.resolve([
        BitcoinDataGenerator.generateUnspentCoin(testConfig.bitcoinWalletImportString, lowLevelWarning - 1)
      ]));
      const hash = randomString();
      const broadcastSpy = spyOn(bitcoinProcessor['bitcoinLedger'], 'broadcastTransaction' as any).and.callFake((transaction: Transaction) => {
        expect(transaction.getFee()).toEqual(bitcoinFee);
        expect(transaction.outputs[0].script.getData()).toEqual(Buffer.from(testConfig.sidetreeTransactionPrefix + hash));
        return Promise.resolve(true);
      });
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
      const coin = BitcoinDataGenerator.generateUnspentCoin(testConfig.bitcoinWalletImportString, 0);
      const getCoinsSpy = spyOn(bitcoinProcessor['bitcoinLedger'], 'getUnspentCoins' as any).and.returnValue(Promise.resolve([
        new Transaction.UnspentOutput({
          txid: coin.txId,
          vout: coin.outputIndex,
          address: coin.address,
          script: coin.script,
          amount: 0
        })
      ]));
      const hash = randomString();
      const broadcastSpy = spyOn(bitcoinProcessor['bitcoinLedger'], 'broadcastTransaction' as any).and.callFake(() => {
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

    it('should fail if broadcastTransaction fails', async (done) => {
      const bitcoinFee = 4000;
      const getCoinsSpy = spyOn(bitcoinProcessor['bitcoinLedger'], 'getUnspentCoins' as any).and.returnValue(Promise.resolve([
        BitcoinDataGenerator.generateUnspentCoin(testConfig.bitcoinWalletImportString, lowLevelWarning + 1)
      ]));
      const hash = randomString();
      const broadcastSpy = spyOn(bitcoinProcessor['bitcoinLedger'], 'broadcastTransaction' as any).and.callFake((transaction: Transaction) => {
        expect(transaction.getFee()).toEqual(bitcoinFee);
        expect(transaction.outputs[0].script.getData()).toEqual(Buffer.from(testConfig.sidetreeTransactionPrefix + hash));
        return Promise.resolve(false);
      });
      try {
        await bitcoinProcessor.writeTransaction(hash, bitcoinFee);
        fail('should have failed');
      } catch (error) {
        expect(error.message).toContain('Could not broadcast');
        expect(getCoinsSpy).toHaveBeenCalled();
        expect(broadcastSpy).toHaveBeenCalled();
      } finally {
        done();
      }
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
      bitcoinProcessor['lastSeenBlock'] = lastBlock;
      processTransactionsSpy.and.callFake((block: IBlockInfo) => {
        expect(block.height).toEqual(lastBlock.height);
        expect(block.hash).toEqual(lastBlock.hash);
        return Promise.resolve({
          hash: nextHash,
          height: nextBlock
        });
      });
      /* tslint:disable-next-line */
      bitcoinProcessor['periodicPoll']();
      // need to wait for the process call
      setTimeout(() => {
        expect(bitcoinProcessor['lastSeenBlock']!.hash).toEqual(nextHash);
        expect(bitcoinProcessor['lastSeenBlock']!.height).toEqual(nextBlock);
        expect(bitcoinProcessor['pollTimeoutId']).toBeDefined();
        // clean up
        clearTimeout(bitcoinProcessor['pollTimeoutId']);
        done();
      }, 300);
    });

    it('should set a timeout to call itself', async (done) => {
      processTransactionsSpy.and.returnValue(Promise.resolve({
        hash: randomString(),
        height: randomNumber()
      }));
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
      const verifySpy = spyOn(bitcoinProcessor, 'verifyBlock' as any).and.returnValue(Promise.resolve(true));
      const processMock = spyOn(bitcoinProcessor, 'processBlock' as any).and.returnValue(Promise.resolve(hash));
      const actual = await bitcoinProcessor['processTransactions'](startBlock, startBlock.height + 1);
      expect(actual.hash).toEqual(hash);
      expect(actual.height).toEqual(startBlock.height + 1);
      expect(verifySpy).toHaveBeenCalled();
      expect(processMock).toHaveBeenCalled();
      done();
    });

    it('should begin a rollback if the start block failed to validate', async (done) => {
      const hash = randomString();
      const startBlock = randomBlock(testConfig.genesisBlockNumber + 100);
      const revertNumber = startBlock.height - 100;
      const verifySpy = spyOn(bitcoinProcessor, 'verifyBlock' as any).and.returnValue(Promise.resolve(false));
      const revertSpy = spyOn(bitcoinProcessor, 'revertBlockchainCache' as any).and.returnValue(Promise.resolve(revertNumber));
      const processMock = spyOn(bitcoinProcessor, 'processBlock' as any).and.returnValue(Promise.resolve(hash));
      const actual = await bitcoinProcessor['processTransactions'](startBlock, startBlock.height + 1);
      expect(actual.height).toEqual(startBlock.height + 1);
      expect(actual.hash).toEqual(hash);
      expect(verifySpy).toHaveBeenCalled();
      expect(revertSpy).toHaveBeenCalled();
      expect(processMock).toHaveBeenCalledWith(revertNumber);
      expect(processMock).toHaveBeenCalledWith(startBlock.height + 1);
      done();
    });

    it('should call processBlock on all blocks within range', async (done) => {
      const hash = randomString();
      const startBlock = randomBlock(testConfig.genesisBlockNumber);
      const verifySpy = spyOn(bitcoinProcessor, 'verifyBlock' as any).and.returnValue(Promise.resolve(true));
      const processMock = spyOn(bitcoinProcessor, 'processBlock' as any).and.returnValue(Promise.resolve(hash));
      await bitcoinProcessor['processTransactions'](startBlock, startBlock.height + 9);
      expect(verifySpy).toHaveBeenCalled();
      expect(processMock).toHaveBeenCalledTimes(10);
      done();
    });

    it('should use the current tip if no end is specified', async (done) => {
      const hash = randomString();
      const startBlock = randomBlock(testConfig.genesisBlockNumber);
      const verifySpy = spyOn(bitcoinProcessor, 'verifyBlock' as any).and.returnValue(Promise.resolve(true));
      const tipSpy = spyOn(bitcoinProcessor['bitcoinLedger'], 'getCurrentBlockHeight' as any).and.returnValue(Promise.resolve(startBlock.height + 1));
      const processMock = spyOn(bitcoinProcessor, 'processBlock' as any).and.returnValue(Promise.resolve(hash));
      await bitcoinProcessor['processTransactions'](startBlock);
      expect(verifySpy).toHaveBeenCalled();
      expect(tipSpy).toHaveBeenCalled();
      expect(processMock).toHaveBeenCalledTimes(2);
      done();
    });

    it('should use genesis if no start is specified', async (done) => {
      const verifySpy = spyOn(bitcoinProcessor, 'verifyBlock' as any);
      // tslint:disable-next-line: max-line-length
      const tipSpy = spyOn(bitcoinProcessor['bitcoinLedger'], 'getCurrentBlockHeight' as any).and.returnValue(Promise.resolve(testConfig.genesisBlockNumber + 1));
      const processMock = spyOn(bitcoinProcessor, 'processBlock' as any).and.returnValue(Promise.resolve(randomString()));
      await bitcoinProcessor['processTransactions']();
      expect(verifySpy).not.toHaveBeenCalled();
      expect(tipSpy).toHaveBeenCalled();
      expect(processMock).toHaveBeenCalledTimes(2);
      done();
    });

    it('should throw if asked to start processing before genesis', async (done) => {
      const verifySpy = spyOn(bitcoinProcessor, 'verifyBlock' as any).and.returnValue(Promise.resolve(true));
      // tslint:disable-next-line: max-line-length
      const tipSpy = spyOn(bitcoinProcessor['bitcoinLedger'], 'getCurrentBlockHeight' as any).and.returnValue(Promise.resolve(testConfig.genesisBlockNumber + 1));
      const processMock = spyOn(bitcoinProcessor, 'processBlock' as any);
      try {
        await bitcoinProcessor['processTransactions']({ height: testConfig.genesisBlockNumber - 10, hash: randomString() });
        fail('should have thrown');
      } catch (error) {
        expect(error.message).toContain('before genesis');
        expect(verifySpy).toHaveBeenCalled();
        expect(tipSpy).toHaveBeenCalled();
        expect(processMock).not.toHaveBeenCalled();
      } finally {
        done();
      }
    });

    it('should throw if asked to process while the miners block height is below genesis', async (done) => {
      const verifySpy = spyOn(bitcoinProcessor, 'verifyBlock' as any);
      // tslint:disable-next-line: max-line-length
      const tipSpy = spyOn(bitcoinProcessor['bitcoinLedger'], 'getCurrentBlockHeight' as any).and.returnValue(Promise.resolve(testConfig.genesisBlockNumber - 1));
      const processMock = spyOn(bitcoinProcessor, 'processBlock' as any);
      try {
        await bitcoinProcessor['processTransactions']();
        fail('should have thrown');
      } catch (error) {
        expect(error.message).toContain('before genesis');
        expect(verifySpy).not.toHaveBeenCalled();
        expect(tipSpy).toHaveBeenCalled();
        expect(processMock).not.toHaveBeenCalled();
      } finally {
        done();
      }
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
      const actual = await bitcoinProcessor['revertBlockchainCache']();
      expect(actual).toEqual(transactions[1].transactionTime);
      expect(transactionCount).toHaveBeenCalled();
      expect(exponentialTransactions).toHaveBeenCalled();
      expect(firstValid).toHaveBeenCalled();
      expect(removeTransactions).toHaveBeenCalled();
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
      const actual = await bitcoinProcessor['revertBlockchainCache']();
      expect(actual).toEqual(transactions[0].transactionTime);
      expect(transactionCount).toHaveBeenCalledTimes(2);
      expect(exponentialTransactions).toHaveBeenCalledTimes(2);
      expect(firstValid).toHaveBeenCalledTimes(2);
      expect(removeTransactions).toHaveBeenCalledTimes(2);
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
      const actual = await bitcoinProcessor['revertBlockchainCache']();
      expect(actual).toEqual(testConfig.genesisBlockNumber);
      expect(transactionCount).toHaveBeenCalled();
      expect(exponentialTransactions).toHaveBeenCalled();
      expect(firstValid).toHaveBeenCalled();
      expect(removeTransactions).toHaveBeenCalled();
      done();
    });
  });

  describe('verifyBlock', () => {
    it('should return true if the hash matches given a block height', async (done) => {
      const height = randomNumber();
      const hash = randomString();
      const mock = spyOn(bitcoinProcessor['bitcoinLedger'], 'getBlockHash' as any).and.returnValue(hash);
      const actual = await bitcoinProcessor['verifyBlock'](height, hash);
      expect(actual).toBeTruthy();
      expect(mock).toHaveBeenCalled();
      done();
    });

    it('should return false if the hash does not match given a block height', async (done) => {
      const height = randomNumber();
      const hash = randomString();
      const mock = spyOn(bitcoinProcessor['bitcoinLedger'], 'getBlockHash' as any).and.returnValue(randomString());
      const actual = await bitcoinProcessor['verifyBlock'](height, hash);
      expect(actual).toBeFalsy();
      expect(mock).toHaveBeenCalled();
      done();
    });
  });

  describe('processBlock', () => {

    // creates a response object for Bitcoin
    async function generateBlock (blockHeight: number, data?: () => string | string[] | undefined): Promise<BlockData> {
      const tx: Transaction[] = [];
      const count = randomNumber(100) + 10;
      for (let i = 0; i < count; i++) {
        const transaction = BitcoinDataGenerator.generateBitcoinTransaction(BitcoinProcessor.generatePrivateKey('testnet'), 1);
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
        transactions: tx
      };
    }

    it('should review all transactions in a block and add them to the transactionStore', async (done) => {
      const block = randomNumber();
      let shouldFindIDs: string[] = [];
      const blockData = await generateBlock(block, () => {
        if (Math.random() > 0.8) {
          const id = randomString();
          shouldFindIDs.push(id);
          return testConfig.sidetreeTransactionPrefix + id;
        }
        return undefined;
      });
      const blockHash = randomString();
      spyOn(bitcoinProcessor['bitcoinLedger'], 'getBlockHash' as any).and.returnValue(blockHash);
      const rpcMock = spyOn(bitcoinProcessor['bitcoinLedger'], 'getBlock');
      rpcMock.and.returnValue(Promise.resolve(blockData));

      let seenTransactionNumbers: number[] = [];
      const addTransaction = spyOn(bitcoinProcessor['transactionStore'],
        'addTransaction').and.callFake((sidetreeTransaction: TransactionModel) => {
          expect(sidetreeTransaction.transactionTime).toEqual(block);
          expect(sidetreeTransaction.transactionTimeHash).toEqual(blockData.hash);
          expect(shouldFindIDs.includes(sidetreeTransaction.anchorString)).toBeTruthy();
          shouldFindIDs.splice(shouldFindIDs.indexOf(sidetreeTransaction.anchorString),1);
          expect(seenTransactionNumbers.includes(sidetreeTransaction.transactionNumber)).toBeFalsy();
          seenTransactionNumbers.push(sidetreeTransaction.transactionNumber);
          return Promise.resolve(undefined);
        });
      const actual = await bitcoinProcessor['processBlock'](block);
      expect(actual).toEqual(blockData.hash);
      expect(rpcMock).toHaveBeenCalled();
      expect(addTransaction).toHaveBeenCalled();
      expect(shouldFindIDs.length).toEqual(0);
      done();
    });

    it('should ignore other data transactions', async (done) => {
      const block = randomNumber();
      let shouldFindIDs: string[] = [];
      const blockData = await generateBlock(block, () => {
        if (Math.random() > 0.8) {
          const id = randomString();
          shouldFindIDs.push(id);
          return testConfig.sidetreeTransactionPrefix + id;
        }
        return randomString();
      });
      const blockHash = randomString();
      spyOn(bitcoinProcessor['bitcoinLedger'], 'getBlockHash' as any).and.returnValue(blockHash);
      const rpcMock = spyOn(bitcoinProcessor['bitcoinLedger'], 'getBlock');
      rpcMock.and.returnValue(Promise.resolve(blockData));

      let seenTransactionNumbers: number[] = [];
      const addTransaction = spyOn(bitcoinProcessor['transactionStore'],
        'addTransaction').and.callFake((sidetreeTransaction: TransactionModel) => {
          expect(sidetreeTransaction.transactionTime).toEqual(block);
          expect(sidetreeTransaction.transactionTimeHash).toEqual(blockData.hash);
          expect(shouldFindIDs.includes(sidetreeTransaction.anchorString)).toBeTruthy();
          shouldFindIDs.splice(shouldFindIDs.indexOf(sidetreeTransaction.anchorString),1);
          expect(seenTransactionNumbers.includes(sidetreeTransaction.transactionNumber)).toBeFalsy();
          seenTransactionNumbers.push(sidetreeTransaction.transactionNumber);
          return Promise.resolve(undefined);
        });
      const actual = await bitcoinProcessor['processBlock'](block);
      expect(actual).toEqual(blockData.hash);
      expect(rpcMock).toHaveBeenCalled();
      expect(addTransaction).toHaveBeenCalled();
      expect(shouldFindIDs.length).toEqual(0);
      done();
    });

    it('should work with transactions that contain no vout parameter', async (done) => {
      const block = randomNumber();
      const blockData = await generateBlock(block);
      const blockHash = randomString();
      spyOn(bitcoinProcessor['bitcoinLedger'], 'getBlockHash' as any).and.returnValue(blockHash);
      const rpcMock = spyOn(bitcoinProcessor['bitcoinLedger'], 'getBlock');
      rpcMock.and.returnValue(Promise.resolve(blockData));

      const addTransaction = spyOn(bitcoinProcessor['transactionStore'],
        'addTransaction');
      const actual = await bitcoinProcessor['processBlock'](block);
      expect(actual).toEqual(blockData.hash);
      expect(rpcMock).toHaveBeenCalled();
      expect(addTransaction).not.toHaveBeenCalled();
      done();
    });

    it('should ignore any transactions that have multiple OP_RETURN in them', async (done) => {
      const block = randomNumber();
      let shouldFindIDs: string[] = [];
      const blockData = await generateBlock(block, () => {
        const id = randomString();
        const rand = Math.random();

        // In order to have random data, this code returns one of the following every time it is called:
        // - 1 sidetree transaction
        // - 2 sidetree transactions (should be ignored)
        // - 2 sidetree and 1 other trasaction (should be ignored)
        //
        if (rand < 0.3) { // 30% of time
          shouldFindIDs.push(id);
          return testConfig.sidetreeTransactionPrefix + id;
        } else if (rand < 0.7) { // == 40% of the time
          const id2 = randomString();

          return [ testConfig.sidetreeTransactionPrefix + id, testConfig.sidetreeTransactionPrefix + id2 ];
        } else { // return 2 sidetree and one other tx
          const id2 = randomString();
          const id3 = randomString();

          return [ testConfig.sidetreeTransactionPrefix + id, id2, testConfig.sidetreeTransactionPrefix + id3 ];
        }
      });

      const blockHash = randomString();
      spyOn(bitcoinProcessor['bitcoinLedger'], 'getBlockHash' as any).and.returnValue(blockHash);
      const rpcMock = spyOn(bitcoinProcessor['bitcoinLedger'], 'getBlock');
      rpcMock.and.returnValue(Promise.resolve(blockData));

      const addTransaction = spyOn(bitcoinProcessor['transactionStore'],
        'addTransaction').and.callFake((sidetreeTransaction: TransactionModel) => {
          expect(shouldFindIDs.includes(sidetreeTransaction.anchorString)).toBeTruthy();
          shouldFindIDs.splice(shouldFindIDs.indexOf(sidetreeTransaction.anchorString),1);
          return Promise.resolve(undefined);
        });
      const actual = await bitcoinProcessor['processBlock'](block);
      expect(actual).toEqual(blockData.hash);
      expect(rpcMock).toHaveBeenCalled();
      expect(addTransaction).toHaveBeenCalled();
      expect(shouldFindIDs.length).toEqual(0);
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

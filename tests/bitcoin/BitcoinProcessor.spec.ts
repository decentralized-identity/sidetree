import BitcoinProcessor, { IBlockInfo } from '../../lib/bitcoin/BitcoinProcessor';
import ErrorCode from '../../lib/common/SharedErrorCode';
import ReadableStream from '../../lib/common/ReadableStream';
import ServiceVersionModel from '../../lib/common/models/ServiceVersionModel';
import TransactionModel from '../../lib/common/models/TransactionModel';
import TransactionNumber from '../../lib/bitcoin/TransactionNumber';
import { IBitcoinConfig } from '../../lib/bitcoin/IBitcoinConfig';
import { PrivateKey, Transaction } from 'bitcore-lib';
import * as httpStatus from 'http-status';
import * as nodeFetchPackage from 'node-fetch';

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
  let quantileCalculatorInitializeSpy: jasmine.Spy;
  let transactionStoreLatestTransactionSpy: jasmine.Spy;
  let getStartingBlockForInitializationSpy: jasmine.Spy;
  let processTransactionsSpy: jasmine.Spy;
  let periodicPollSpy: jasmine.Spy;
  let fetchSpy: jasmine.Spy;
  let retryFetchSpy: jasmine.Spy;

  beforeEach(() => {
    bitcoinProcessor = new BitcoinProcessor(testConfig);
    transactionStoreInitializeSpy = spyOn(bitcoinProcessor['transactionStore'], 'initialize');
    quantileCalculatorInitializeSpy = spyOn(bitcoinProcessor['quantileCalculator'], 'initialize');

    transactionStoreLatestTransactionSpy = spyOn(bitcoinProcessor['transactionStore'], 'getLastTransaction');
    transactionStoreLatestTransactionSpy.and.returnValue(Promise.resolve(undefined));

    getStartingBlockForInitializationSpy = spyOn(bitcoinProcessor as any, 'getStartingBlockForInitialization');
    getStartingBlockForInitializationSpy.and.returnValue(Promise.resolve(undefined));

    processTransactionsSpy = spyOn(bitcoinProcessor, 'processTransactions' as any);
    processTransactionsSpy.and.returnValue(Promise.resolve({ hash: 'IamAHash', height: 54321 }));
    periodicPollSpy = spyOn(bitcoinProcessor, 'periodicPoll' as any);
    // this is always mocked to protect against actual calls to the bitcoin network
    fetchSpy = spyOn(nodeFetchPackage, 'default');
    retryFetchSpy = spyOn(bitcoinProcessor, 'fetchWithRetry' as any);
  });

  function mockRpcCall (method: string, params: any[], returns: any, path?: string): jasmine.Spy {
    return spyOn(bitcoinProcessor, 'rpcCall' as any).and.callFake((request: any, requestPath: string) => {
      if (path) {
        expect(requestPath).toEqual(path);
      }
      expect(request.method).toEqual(method);
      if (request.params) {
        expect(request.params).toEqual(params);
      }
      return Promise.resolve(returns);
    });
  }

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
      expect(bitcoinProcessor.bitcoinPeerUri).toEqual(config.bitcoinPeerUri);
      expect(bitcoinProcessor.bitcoinAuthorization).toEqual(Buffer.from(`${config.bitcoinRpcUsername}:${config.bitcoinRpcPassword}`).toString('base64'));
      expect(bitcoinProcessor.requestTimeout).toEqual(300);
      expect(bitcoinProcessor.genesisBlockNumber).toEqual(config.genesisBlockNumber);
      expect(bitcoinProcessor.lowBalanceNoticeDays).toEqual(28);
      expect(bitcoinProcessor.maxRetries).toEqual(3);
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

    let walletExistsSpy: jasmine.Spy;

    beforeEach(async () => {
      walletExistsSpy = spyOn(bitcoinProcessor, 'walletExists' as any);
      quantileCalculatorInitializeSpy.and.returnValue(Promise.resolve(undefined));
      getStartingBlockForInitializationSpy.and.returnValue(Promise.resolve({ height: 123, hash: 'hash' }));
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
      walletExistsSpy.and.returnValue(Promise.resolve(true));
      expect(periodicPollSpy).not.toHaveBeenCalled();
      await bitcoinProcessor.initialize();
      expect(periodicPollSpy).toHaveBeenCalled();
      done();
    });

    it('should import key if the wallet does not exist', async () => {
      walletExistsSpy.and.returnValue(Promise.resolve(false));
      const publicKeyHex = privateKey.toPublicKey().toBuffer().toString('hex');
      const importSpy = mockRpcCall('importpubkey', [publicKeyHex, 'sidetree', true], undefined);
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
      const tipSpy = spyOn(bitcoinProcessor, 'getCurrentBlockHeight' as any).and.returnValue(Promise.resolve(height));
      const hashSpy = spyOn(bitcoinProcessor, 'getBlockHash' as any).and.returnValue(Promise.resolve(hash));
      const spy = mockRpcCall('getblock', [hash, 1], { hash, height });
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
      const tipSpy = spyOn(bitcoinProcessor, 'getCurrentBlockHeight' as any).and.returnValue(Promise.resolve(height));
      const hashSpy = spyOn(bitcoinProcessor, 'getBlockHash' as any).and.returnValue(Promise.resolve(hash));
      const spy = mockRpcCall('getblock', [hash, 1], { hash, height });
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

  // function specific to bitcoin coin operations
  function generateBitcoinTransaction (satoshis: number = 1, wif: string = testConfig.bitcoinWalletImportString): Transaction {
    const keyObject: PrivateKey = (PrivateKey as any).fromWIF(wif);
    const address = keyObject.toAddress();
    const transaction = new Transaction();
    transaction.to(address, satoshis);
    transaction.change(address);
    return transaction;
  }

  function generateUnspentCoin (satoshis: number): Transaction.UnspentOutput {
    const transaction = generateBitcoinTransaction(satoshis);
    return new Transaction.UnspentOutput({
      txid: transaction.id,
      vout: 0,
      address: transaction.outputs[0].script.getAddressInfo(),
      amount: transaction.outputs[0].satoshis * 0.00000001, // Satoshi amount
      script: transaction.outputs[0].script
    });
  }

  describe('writeTransaction', () => {
    const bitcoinFee = 4000;
    const lowLevelWarning = testConfig.lowBalanceNoticeInDays! * 24 * 6 * bitcoinFee;
    it('should write a transaction if there are enough Satoshis', async (done) => {
      const getCoinsSpy = spyOn(bitcoinProcessor, 'getUnspentCoins' as any).and.returnValue(Promise.resolve([
        generateUnspentCoin(lowLevelWarning + 1)
      ]));
      const hash = randomString();
      const broadcastSpy = spyOn(bitcoinProcessor, 'broadcastTransaction' as any).and.callFake((transaction: Transaction) => {
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
      const getCoinsSpy = spyOn(bitcoinProcessor, 'getUnspentCoins' as any).and.returnValue(Promise.resolve([
        generateUnspentCoin(lowLevelWarning - 1)
      ]));
      const hash = randomString();
      const broadcastSpy = spyOn(bitcoinProcessor, 'broadcastTransaction' as any).and.callFake((transaction: Transaction) => {
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
      const coin = generateUnspentCoin(0);
      const getCoinsSpy = spyOn(bitcoinProcessor, 'getUnspentCoins' as any).and.returnValue(Promise.resolve([
        new Transaction.UnspentOutput({
          txid: coin.txId,
          vout: coin.outputIndex,
          address: coin.address,
          script: coin.script,
          amount: 0
        })
      ]));
      const hash = randomString();
      const broadcastSpy = spyOn(bitcoinProcessor, 'broadcastTransaction' as any).and.callFake(() => {
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
      const getCoinsSpy = spyOn(bitcoinProcessor, 'getUnspentCoins' as any).and.returnValue(Promise.resolve([
        generateUnspentCoin(lowLevelWarning + 1)
      ]));
      const hash = randomString();
      const broadcastSpy = spyOn(bitcoinProcessor, 'broadcastTransaction' as any).and.callFake((transaction: Transaction) => {
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

  describe('getNormalizedFee', () => {

    let mockedCurrentHeight: number;
    let validBlockHeight: number;

    beforeEach(() => {
      mockedCurrentHeight = bitcoinProcessor['genesisBlockNumber'] + 200;
      validBlockHeight = mockedCurrentHeight - 50;

      spyOn(bitcoinProcessor, 'getCurrentBlockHeight' as any).and.returnValue(Promise.resolve(mockedCurrentHeight));
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

  describe('getBlockHash', () => {
    it('should get the block hash', async () => {
      const height = randomNumber();
      const hash = randomString();
      const spy = mockRpcCall('getblockhash', [height], hash);
      const actual = await bitcoinProcessor['getBlockHash'](height);
      expect(actual).toEqual(hash);
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('getUnspentCoins', () => {
    it('should query for unspent output coins given an address', async (done) => {
      const coin = generateUnspentCoin(1);

      const coinSpy = mockRpcCall('listunspent', [null, null, [coin.address.toString()]], [
        {
          txId: coin.txId,
          outputIndex: coin.outputIndex,
          address: coin.address,
          script: coin.script,
          satoshis: coin.satoshis
        }
      ]);
      const actual = await bitcoinProcessor['getUnspentCoins'](coin.address);
      expect(coinSpy).toHaveBeenCalled();
      expect(actual[0].address).toEqual(coin.address);
      expect(actual[0].txId).toEqual(coin.txId);
      done();
    });

    it('should return empty if no coins were found', async (done) => {
      const coin = generateUnspentCoin(1);
      const coinSpy = mockRpcCall('listunspent', [null, null, [coin.address.toString()]], []);
      const actual = await bitcoinProcessor['getUnspentCoins'](coin.address);
      expect(coinSpy).toHaveBeenCalled();
      expect(actual).toEqual([]);
      done();
    });
  });

  describe('broadcastTransaction', () => {
    it('should serialize and broadcast a transaction', async (done) => {
      const transaction = generateBitcoinTransaction();
      // need to disable transaction serialization
      spyOn(transaction, 'serialize').and.callFake(() => transaction.toString());
      const spy = mockRpcCall('sendrawtransaction', [transaction.toString()], [transaction.toString()]);
      const actual = await bitcoinProcessor['broadcastTransaction'](transaction);
      expect(actual).toBeTruthy();
      expect(spy).toHaveBeenCalled();
      done();
    });

    it('should throw if the request failed', async (done) => {
      const transaction = generateBitcoinTransaction();
      // need to disable transaction serialization
      spyOn(transaction, 'serialize').and.callFake(() => transaction.toString());
      const spy = mockRpcCall('sendrawtransaction', [transaction.toString()], [transaction.toString()]);
      spy.and.throwError('test');
      try {
        await bitcoinProcessor['broadcastTransaction'](transaction);
        fail('should have thrown');
      } catch (error) {
        expect(error.message).toContain('test');
        expect(spy).toHaveBeenCalled();
      } finally {
        done();
      }
    });

    it('should return false if the broadcast failed', async (done) => {
      const transaction = generateBitcoinTransaction();
      // need to disable transaction serialization
      spyOn(transaction, 'serialize').and.callFake(() => transaction.toString());
      const spy = mockRpcCall('sendrawtransaction', [transaction.toString()], []);
      const actual = await bitcoinProcessor['broadcastTransaction'](transaction);
      expect(actual).toBeFalsy();
      expect(spy).toHaveBeenCalled();
      done();
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

      /* tslint:disable-next-line */
      bitcoinProcessor['periodicPoll']();
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
      const getCurrentHeightMock = spyOn(bitcoinProcessor as any,'getCurrentBlockHeight').and.returnValue(Promise.resolve(startBlock.height + 1));
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
      const getCurrentHeightMock = spyOn(bitcoinProcessor as any,'getCurrentBlockHeight').and.returnValue(Promise.resolve(startBlock.height + 9));

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
      const tipSpy = spyOn(bitcoinProcessor, 'getCurrentBlockHeight' as any).and.returnValue(Promise.resolve(startBlock.height + 1));
      const processMock = spyOn(bitcoinProcessor, 'processBlock' as any).and.returnValue(Promise.resolve(hash));
      const actual = await bitcoinProcessor['processTransactions'](startBlock);
      expect(bitcoinProcessor['lastProcessedBlock']).toBeDefined();
      expect(actual).toEqual(bitcoinProcessor['lastProcessedBlock']!);
      expect(tipSpy).toHaveBeenCalled();
      expect(processMock).toHaveBeenCalledTimes(2);
      done();
    });

    it('should throw if asked to start processing before genesis', async (done) => {
      const tipSpy = spyOn(bitcoinProcessor, 'getCurrentBlockHeight' as any).and.returnValue(Promise.resolve(testConfig.genesisBlockNumber + 1));
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
      spyOn(bitcoinProcessor as any, 'getBlockHash').and.returnValue(mockStartingBlockHash);

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
      spyOn(bitcoinProcessor as any, 'getBlockHash').and.returnValue(mockStartingBlockHash);
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
      spyOn(bitcoinProcessor as any, 'getCurrentBlockHeight').and.returnValue(actualLastProcessedBlock.height + 1);
      spyOn(bitcoinProcessor as any, 'getBlockHash').and.returnValue(Promise.resolve('some_hash'));

      const actual = await bitcoinProcessor['getStartingBlockForPeriodicPoll']();
      expect(actual).toBeDefined();
      expect(actual!.height).toEqual(actualLastProcessedBlock.height + 1);
    });

    it('should return undefined if the last-processed-block is same as the current height', async () => {
      spyOn(bitcoinProcessor as any, 'verifyBlock').and.returnValue(Promise.resolve(true));
      spyOn(bitcoinProcessor as any, 'getCurrentBlockHeight').and.returnValue(actualLastProcessedBlock.height);
      spyOn(bitcoinProcessor as any, 'getBlockHash').and.returnValue(Promise.resolve('some_hash'));

      const actual = await bitcoinProcessor['getStartingBlockForPeriodicPoll']();
      expect(actual).not.toBeDefined();
    });

    it('should revert blockchain if verifyblock fails', async () => {
      const mockHeightAfterRevert = actualLastProcessedBlock.height - 1;

      const revertBlockchainSpy = spyOn(bitcoinProcessor as any, 'revertBlockchainCache');
      revertBlockchainSpy.and.returnValue({ height: mockHeightAfterRevert, hash: randomString() });

      spyOn(bitcoinProcessor as any, 'verifyBlock').and.returnValue(Promise.resolve(false));
      spyOn(bitcoinProcessor as any, 'getCurrentBlockHeight').and.returnValue(actualLastProcessedBlock.height + 1);
      spyOn(bitcoinProcessor as any, 'getBlockHash').and.returnValue(Promise.resolve('some_hash'));

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
      spyOn(bitcoinProcessor,'getBlockHash' as any).and.returnValue(Promise.resolve(mockHash));

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
      spyOn(bitcoinProcessor,'getBlockHash' as any).and.returnValue(Promise.resolve(mockHash));

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
      spyOn(bitcoinProcessor,'getBlockHash' as any).and.returnValue(Promise.resolve(mockHash));

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

  describe('getCurrentBlockHeight', () => {
    it('should return the latest block', async (done) => {
      const height = randomNumber();
      const mock = mockRpcCall('getblockcount', [], height);
      const actual = await bitcoinProcessor['getCurrentBlockHeight']();
      expect(actual).toEqual(height);
      expect(mock).toHaveBeenCalled();
      done();
    });
  });

  describe('verifyBlock', () => {
    it('should return true if the hash matches given a block height', async (done) => {
      const height = randomNumber();
      const hash = randomString();
      const mock = spyOn(bitcoinProcessor, 'getBlockHash' as any).and.returnValue(hash);
      const actual = await bitcoinProcessor['verifyBlock'](height, hash);
      expect(actual).toBeTruthy();
      expect(mock).toHaveBeenCalled();
      done();
    });

    it('should return false if the hash does not match given a block height', async (done) => {
      const height = randomNumber();
      const hash = randomString();
      const mock = spyOn(bitcoinProcessor, 'getBlockHash' as any).and.returnValue(randomString());
      const actual = await bitcoinProcessor['verifyBlock'](height, hash);
      expect(actual).toBeFalsy();
      expect(mock).toHaveBeenCalled();
      done();
    });
  });

  describe('processBlock', () => {

    // creates a response object for Bitcoin
    async function generateBlock (blockHeight: number, data?: () => string | string[] | undefined): Promise<any> {
      const tx: any[] = [];
      const count = randomNumber(100) + 10;
      for (let i = 0; i < count; i++) {
        const transaction = generateBitcoinTransaction(1, BitcoinProcessor.generatePrivateKey('testnet'));
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
        const vout: any[] = [];
        transaction.outputs.forEach((output, index) => {
          vout.push({
            value: output.satoshis,
            n: index,
            scriptPubKey: {
              asm: output.script.toASM(),
              hex: output.script.toHex(),
              addresses: [
                output.script.getAddressInfo()
              ]
            }
          });
        });

        tx.push({
          txid: transaction.id,
          hash: transaction.id,
          vin: [
            { // every block in the mining reward because its easier and not verified by us
              coinbase: randomString(),
              sequence: randomNumber()
            }
          ],
          vout
        });
      }
      return {
        hash: randomString(),
        height: blockHeight,
        tx
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
      spyOn(bitcoinProcessor, 'processBlockForPofCalculation' as any).and.returnValue(Promise.resolve());
      spyOn(bitcoinProcessor, 'getTransactionOutValueInSatoshi' as any).and.returnValue(Promise.resolve(1));
      spyOn(bitcoinProcessor, 'getTransactionFeeInSatoshi' as any).and.returnValue(Promise.resolve(1));
      spyOn(bitcoinProcessor, 'getNormalizedFee' as any).and.returnValue(Promise.resolve({ normalizedTransactionFee: 1 }));
      spyOn(bitcoinProcessor, 'getBlockHash' as any).and.returnValue(blockHash);
      const rpcMock = mockRpcCall('getblock', [blockHash, 2], blockData);
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
      spyOn(bitcoinProcessor, 'processBlockForPofCalculation' as any).and.returnValue(Promise.resolve());
      spyOn(bitcoinProcessor, 'getTransactionOutValueInSatoshi' as any).and.returnValue(Promise.resolve(1));
      spyOn(bitcoinProcessor, 'getTransactionFeeInSatoshi' as any).and.returnValue(Promise.resolve(1));
      spyOn(bitcoinProcessor, 'getNormalizedFee' as any).and.returnValue(Promise.resolve({ normalizedTransactionFee: 1 }));
      spyOn(bitcoinProcessor, 'getBlockHash' as any).and.returnValue(blockHash);
      const rpcMock = mockRpcCall('getblock', [blockHash, 2], blockData);
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
      blockData.tx = blockData.tx.map((transaction: any) => {
        return {
          txid: transaction.txid,
          hash: transaction.hash
        };
      });
      const blockHash = randomString();
      spyOn(bitcoinProcessor, 'processBlockForPofCalculation' as any).and.returnValue(Promise.resolve());
      spyOn(bitcoinProcessor, 'getTransactionOutValueInSatoshi' as any).and.returnValue(Promise.resolve(1));
      spyOn(bitcoinProcessor, 'getTransactionFeeInSatoshi' as any).and.returnValue(Promise.resolve(1));
      spyOn(bitcoinProcessor, 'getNormalizedFee' as any).and.returnValue(Promise.resolve({ normalizedTransactionFee: 1 }));
      spyOn(bitcoinProcessor, 'getBlockHash' as any).and.returnValue(blockHash);
      const rpcMock = mockRpcCall('getblock', [blockHash, 2], blockData);
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
      spyOn(bitcoinProcessor, 'processBlockForPofCalculation' as any).and.returnValue(Promise.resolve());
      spyOn(bitcoinProcessor, 'getTransactionOutValueInSatoshi' as any).and.returnValue(Promise.resolve(1));
      spyOn(bitcoinProcessor, 'getTransactionFeeInSatoshi' as any).and.returnValue(Promise.resolve(1));
      spyOn(bitcoinProcessor, 'getNormalizedFee' as any).and.returnValue(Promise.resolve({ normalizedTransactionFee: 1 }));
      spyOn(bitcoinProcessor, 'getBlockHash' as any).and.returnValue(blockHash);
      const rpcMock = mockRpcCall('getblock', [blockHash, 2], blockData);
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
        spyOn(bitcoinProcessor, 'getTransactionFeeInSatoshi' as any).and.callFake((_id: any) => {
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

  describe('walletExists', () => {
    it('should check if the wallet is watch only', async () => {
      const address = randomString();
      const spy = mockRpcCall('getaddressinfo', [address], {
        address,
        scriptPubKey: randomString(),
        ismine: false,
        solvable: true,
        desc: 'Test Address data',
        iswatchonly: true,
        isscript: false,
        iswitness: false,
        pubkey: randomString(),
        iscompressed: true,
        ischange: false,
        timestamp: 0,
        labels: []
      });
      const actual = await bitcoinProcessor['walletExists'](address);
      expect(actual).toBeTruthy();
      expect(spy).toHaveBeenCalled();
    });

    it('should check if the wallet has labels', async () => {
      const address = randomString();
      const spy = mockRpcCall('getaddressinfo', [address], {
        address,
        scriptPubKey: randomString(),
        ismine: false,
        solvable: true,
        desc: 'Test Address data',
        iswatchonly: false,
        isscript: false,
        iswitness: false,
        pubkey: randomString(),
        iscompressed: true,
        label: 'sidetree',
        ischange: false,
        timestamp: 0,
        labels: [
          {
            name: 'sidetree',
            purpose: 'receive'
          }
        ]
      });
      const actual = await bitcoinProcessor['walletExists'](address);
      expect(actual).toBeTruthy();
      expect(spy).toHaveBeenCalled();
    });

    it('should return false if it appears to be a random address', async () => {
      const address = randomString();
      const spy = mockRpcCall('getaddressinfo', [address], {
        address,
        scriptPubKey: randomString(),
        ismine: false,
        solvable: false,
        iswatchonly: false,
        isscript: true,
        iswitness: false,
        ischange: false,
        labels: []
      });
      const actual = await bitcoinProcessor['walletExists'](address);
      expect(actual).toBeFalsy();
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('rpcCall', () => {
    it('should make a request and return the result', async (done) => {
      const path = randomString();
      const request: any = {};
      const memberName = randomString();
      const memberValue = randomString();
      request[memberName] = memberValue;
      const bodyIdentifier = randomNumber();
      const result = randomString();
      retryFetchSpy.and.callFake((uri: string, params: any) => {
        expect(uri).toContain(testConfig.bitcoinPeerUri);
        expect(uri.endsWith(path)).toBeTruthy();
        expect(params.method).toEqual('post');
        expect(JSON.parse(params.body)[memberName]).toEqual(memberValue);
        return Promise.resolve({
          status: httpStatus.OK,
          body: bodyIdentifier
        });
      });
      const readUtilSpy = spyOn(ReadableStream, 'readAll').and.callFake((body: any) => {
        expect(body).toEqual(bodyIdentifier);
        return Promise.resolve(Buffer.from(JSON.stringify({
          result,
          error: null,
          id: null
        })));
      });
      const actual = await bitcoinProcessor['rpcCall'](request, path);
      expect(actual).toEqual(result);
      expect(retryFetchSpy).toHaveBeenCalled();
      expect(readUtilSpy).toHaveBeenCalled();
      done();
    });
    it('should throw if the request failed', async (done) => {
      const request: any = {
        'test': randomString()
      };
      const result = randomString();
      const statusCode = randomNumber();
      retryFetchSpy.and.callFake((uri: string, params: any) => {
        expect(uri).toContain(testConfig.bitcoinPeerUri);
        expect(params.method).toEqual('post');
        expect(JSON.parse(params.body).test).toEqual(request.test);
        return Promise.resolve({
          status: statusCode
        });
      });
      const readUtilSpy = spyOn(ReadableStream, 'readAll').and.callFake(() => {
        return Promise.resolve(Buffer.from(result));
      });
      try {
        await bitcoinProcessor['rpcCall'](request);
        fail('should have thrown');
      } catch (error) {
        expect(error.message).toContain('Fetch');
        expect(error.message).toContain(statusCode.toString());
        expect(error.message).toContain(result);
        expect(retryFetchSpy).toHaveBeenCalled();
        expect(readUtilSpy).toHaveBeenCalled();
      } finally {
        done();
      }
    });
    it('should throw if the RPC call failed', async (done) => {
      const request: any = {
        'test': randomString()
      };
      const result = randomString();
      retryFetchSpy.and.callFake((uri: string, params: any) => {
        expect(uri).toContain(testConfig.bitcoinPeerUri);
        expect(params.method).toEqual('post');
        expect(JSON.parse(params.body).test).toEqual(request.test);
        return Promise.resolve({
          status: httpStatus.OK
        });
      });
      const readUtilSpy = spyOn(ReadableStream, 'readAll').and.callFake(() => {
        return Promise.resolve(Buffer.from(JSON.stringify({
          result: null,
          error: result,
          id: null
        })));
      });
      try {
        await bitcoinProcessor['rpcCall'](request);
        fail('should have thrown');
      } catch (error) {
        expect(error.message).toContain('RPC');
        expect(error.message).toContain(result);
        expect(retryFetchSpy).toHaveBeenCalled();
        expect(readUtilSpy).toHaveBeenCalled();
      } finally {
        done();
      }
    });
  });

  describe('fetchWithRetry', () => {
    beforeEach(() => {
      retryFetchSpy.and.callThrough();
    });

    it('should fetch the URI with the given requestParameters', async (done) => {
      const path = randomString();
      const request: any = {
        headers: {}
      };
      const memberName = randomString();
      const memberValue = randomString();
      request.headers[memberName] = memberValue;
      const result = randomNumber();
      fetchSpy.and.callFake((uri: string, params: any) => {
        expect(uri).toEqual(path);
        expect(params.headers[memberName]).toEqual(memberValue);
        return Promise.resolve(result);
      });
      const actual = await bitcoinProcessor['fetchWithRetry'](path, request);
      expect(actual as any).toEqual(result);
      expect(fetchSpy).toHaveBeenCalled();
      done();
    });
    it('should retry with an extended time period if the request timed out', async (done) => {
      const requestId = randomString();
      let timeout: number;
      fetchSpy.and.callFake((_: any, params: any) => {
        expect(params.headers.id).toEqual(requestId, 'Fetch was not called with request parameters');
        if (timeout) {
          expect(params.timeout).toBeGreaterThan(timeout, 'Fetch was not called with an extended timeout');
          return Promise.resolve();
        } else {
          timeout = params.timeout;
          return Promise.reject(new nodeFetchPackage.FetchError('test', 'request-timeout'));
        }
      });
      await bitcoinProcessor['fetchWithRetry']('localhost', { headers: { id: requestId } });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      done();
    });
    it('should stop retrying after the max retry limit', async (done) => {
      fetchSpy.and.callFake((_: any, __: any) => {
        return Promise.reject(new nodeFetchPackage.FetchError('test', 'request-timeout'));
      });
      try {
        await bitcoinProcessor['fetchWithRetry']('localhost');
      } catch (error) {
        expect(error.message).toEqual('test');
        expect(error.type).toEqual('request-timeout');
        expect(fetchSpy).toHaveBeenCalledTimes(testConfig.requestMaxRetries! + 1);
      } finally {
        done();
      }
    });
    it('should throw non timeout errors immediately', async (done) => {
      let timeout = true;
      const result = randomString();
      fetchSpy.and.callFake((_: any, __: any) => {
        if (timeout) {
          timeout = false;
          return Promise.reject(new nodeFetchPackage.FetchError('test', 'request-timeout'));
        } else {
          return Promise.reject(new Error(result));
        }
      });
      try {
        await bitcoinProcessor['fetchWithRetry']('localhost');
      } catch (error) {
        expect(error.message).toEqual(result);
        expect(fetchSpy).toHaveBeenCalledTimes(2);
      } finally {
        done();
      }
    });
  });

  describe('waitFor', () => {
    it('should return after the given amount of time', async (done) => {
      let approved = false;
      setTimeout(() => {
        approved = true;
      }, 300);
      await bitcoinProcessor['waitFor'](400);
      expect(approved).toBeTruthy();
      done();
    }, 500);
  });

  describe('getServiceVersion', () => {

    it('should return the correct response body for the version request', async () => {
      const expectedVersion: ServiceVersionModel = {
        name: 'test-service',
        version: 'x.y.z'
      };

      // Make the handle service version call return the test value
      spyOn(bitcoinProcessor['serviceInfo'], 'getServiceVersion').and.returnValue(expectedVersion);

      const fetchedVersion = await bitcoinProcessor.getServiceVersion();

      expect(fetchedVersion.name).toEqual(expectedVersion.name);
      expect(fetchedVersion.version).toEqual(expectedVersion.version);
    });
  });
});

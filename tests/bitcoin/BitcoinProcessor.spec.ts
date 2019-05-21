import { IBitcoinConfig } from '../../lib/bitcoin/IBitcoinConfig';
import BitcoinProcessor, { IBlockInfo } from '../../lib/bitcoin/BitcoinProcessor';
import TransactionNumber from '../../lib/bitcoin/TransactionNumber';
import { PrivateKey, Transaction } from 'bitcore-lib';
import { ITransaction } from '../../lib/core/Transaction';
import * as httpStatus from 'http-status';
import ReadableStream from '../../lib/core/util/ReadableStream';
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
    bitcoinExtensionUri: 'http://localhost:18331',
    bitcoinFee: 1,
    bitcoinWalletImportString: BitcoinProcessor.generatePrivateKey('testnet'),
    databaseName: 'bitcoin-test',
    defaultTimeoutInMilliseconds: 300,
    genesisBlockNumber: 1480000,
    lowBalanceNoticeInDays: 28,
    maxRetries: 3,
    transactionFetchPageSize: 100,
    mongoDbConnectionString: 'mongodb://localhost:27017',
    sidetreeTransactionPrefix: 'sidetree:',
    transactionPollPeriodInSeconds: 60
  };

  let bitcoinProcessor: BitcoinProcessor;
  let transactionStoreInitializeSpy: jasmine.Spy;
  let transactionStoreLatestTransactionSpy: jasmine.Spy;
  let processTransactionsSpy: jasmine.Spy;
  let periodicPollSpy: jasmine.Spy;
  let fetchSpy: jasmine.Spy;
  let retryFetchSpy: jasmine.Spy;

  beforeEach(() => {
    bitcoinProcessor = new BitcoinProcessor(testConfig);
    transactionStoreInitializeSpy = spyOn(bitcoinProcessor['transactionStore'], 'initialize');
    transactionStoreLatestTransactionSpy = spyOn(bitcoinProcessor['transactionStore'], 'getLastTransaction');
    transactionStoreLatestTransactionSpy.and.returnValue(Promise.resolve(undefined));
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

  function createTransactions (count?: number, height?: number): ITransaction[] {
    const transactions: ITransaction[] = [];
    if (!count) {
      count = randomNumber(9) + 1;
    }
    if (!height) {
      height = randomNumber();
    }
    const hash = randomString();
    for (let i = 0; i < count; i++) {
      transactions.push({
        transactionNumber: TransactionNumber.construct(height, i),
        transactionTime: height,
        transactionTimeHash: hash,
        anchorFileHash: randomString()
      });
    }
    return transactions;
  }

  describe('constructor', () => {
    it('should use appropriate config values', () => {
      const config: IBitcoinConfig = {
        bitcoinExtensionUri: randomString(),
        bitcoinFee: randomNumber(),
        bitcoinWalletImportString: BitcoinProcessor.generatePrivateKey('testnet'),
        databaseName: randomString(),
        genesisBlockNumber: randomNumber(),
        transactionFetchPageSize: randomNumber(),
        mongoDbConnectionString: randomString(),
        sidetreeTransactionPrefix: randomString(4),
        lowBalanceNoticeInDays: undefined,
        defaultTimeoutInMilliseconds: undefined,
        maxRetries: undefined,
        transactionPollPeriodInSeconds: undefined
      };

      const bitcoinProcessor = new BitcoinProcessor(config);
      expect(bitcoinProcessor.bitcoinExtensionUri).toEqual(config.bitcoinExtensionUri);
      expect(bitcoinProcessor.bitcoinFee).toEqual(config.bitcoinFee);
      expect(bitcoinProcessor.defaultTimeout).toEqual(300);
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
        bitcoinExtensionUri: randomString(),
        bitcoinFee: randomNumber(),
        bitcoinWalletImportString: 'wrong!',
        databaseName: randomString(),
        genesisBlockNumber: randomNumber(),
        transactionFetchPageSize: randomNumber(),
        mongoDbConnectionString: randomString(),
        sidetreeTransactionPrefix: randomString(4),
        lowBalanceNoticeInDays: undefined,
        defaultTimeoutInMilliseconds: undefined,
        maxRetries: undefined,
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
    it('should initialize the transactionStore', async (done) => {
      expect(transactionStoreInitializeSpy).not.toHaveBeenCalled();
      await bitcoinProcessor.initialize();
      expect(transactionStoreInitializeSpy).toHaveBeenCalled();
      done();
    });

    it('should process all the blocks since its last known', async (done) => {
      const fromNumber = randomNumber();
      const fromHash = randomString();
      transactionStoreLatestTransactionSpy.and.returnValue(
        Promise.resolve({
          transactionNumber: randomNumber(),
          transactionTime: fromNumber,
          transactionTimeHash: fromHash,
          anchorFileHash: randomString()
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
      expect(periodicPollSpy).not.toHaveBeenCalled();
      await bitcoinProcessor.initialize();
      expect(periodicPollSpy).toHaveBeenCalled();
      done();
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
      const spy = mockRpcCall('getblockbyheight', [height, true, false], { hash, height });
      const actual = await bitcoinProcessor.time();
      expect(actual.time).toEqual(height);
      expect(actual.hash).toEqual(hash);
      expect(tipSpy).toHaveBeenCalled();
      expect(spy).toHaveBeenCalled();
      done();
    });

    it('should get the corresponding bitcoin height given a hash', async (done) => {
      const height = randomNumber();
      const hash = randomString();
      const spy = mockRpcCall('getblock', [hash, true, false], { hash, height });
      const actual = await bitcoinProcessor.time(hash);
      expect(actual.time).toEqual(height);
      expect(actual.hash).toEqual(hash);
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
        expect(error.code).not.toEqual('invalid_transaction_number_or_time_hash');
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
        expect(error.code).toEqual('invalid_transaction_number_or_time_hash');
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
      const transactions: ITransaction[] = [];
      let heights: number[] = [];
      const count = 10;
      for (let i = 0; i < count; i++) {
        const height = randomNumber();
        heights.push(height);
        transactions.push({
          anchorFileHash: randomString(),
          transactionNumber: TransactionNumber.construct(height, randomNumber()),
          transactionTime: height,
          transactionTimeHash: randomString()
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
    const lowLevelWarning = testConfig.lowBalanceNoticeInDays! * 24 * 6 * testConfig.bitcoinFee;
    it('should write a transaction if there are enough Satoshis', async (done) => {
      const getCoinsSpy = spyOn(bitcoinProcessor, 'getUnspentCoins' as any).and.returnValue(Promise.resolve([
        generateUnspentCoin(lowLevelWarning + 1)
      ]));
      const hash = randomString();
      const broadcastSpy = spyOn(bitcoinProcessor, 'broadcastTransaction' as any).and.callFake((transaction: Transaction) => {
        expect(transaction.getFee()).toEqual(testConfig.bitcoinFee);
        expect(transaction.outputs[0].script.getData()).toEqual(Buffer.from(testConfig.sidetreeTransactionPrefix + hash));
        return Promise.resolve(true);
      });
      await bitcoinProcessor.writeTransaction(hash);
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
        expect(transaction.getFee()).toEqual(testConfig.bitcoinFee);
        expect(transaction.outputs[0].script.getData()).toEqual(Buffer.from(testConfig.sidetreeTransactionPrefix + hash));
        return Promise.resolve(true);
      });
      const errorSpy = spyOn(global.console, 'error').and.callFake((message: string) => {
        expect(message).toContain('fund your wallet');
      });
      await bitcoinProcessor.writeTransaction(hash);
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
        await bitcoinProcessor.writeTransaction(hash);
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
      const getCoinsSpy = spyOn(bitcoinProcessor, 'getUnspentCoins' as any).and.returnValue(Promise.resolve([
        generateUnspentCoin(lowLevelWarning + 1)
      ]));
      const hash = randomString();
      const broadcastSpy = spyOn(bitcoinProcessor, 'broadcastTransaction' as any).and.callFake((transaction: Transaction) => {
        expect(transaction.getFee()).toEqual(testConfig.bitcoinFee);
        expect(transaction.outputs[0].script.getData()).toEqual(Buffer.from(testConfig.sidetreeTransactionPrefix + hash));
        return Promise.resolve(false);
      });
      try {
        await bitcoinProcessor.writeTransaction(hash);
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

  describe('getUnspentCoins', () => {
    it('should query for unspent output coins given an address', async (done) => {
      const coin = generateUnspentCoin(1);
      retryFetchSpy.and.callFake((uri: string) => {
        expect(uri).toContain('/coin/address/');
        return {
          status: httpStatus.OK
        };
      });
      const readStreamSpy = spyOn(ReadableStream, 'readAll').and.returnValue(Promise.resolve(JSON.stringify([
        {
          hash: coin.txId,
          index: coin.outputIndex,
          address: coin.address,
          script: coin.script,
          value: coin.satoshis
        }
      ])));
      const actual = await bitcoinProcessor['getUnspentCoins'](coin.address);
      expect(retryFetchSpy).toHaveBeenCalled();
      expect(readStreamSpy).toHaveBeenCalled();
      expect(actual[0].address).toEqual(coin.address);
      expect(actual[0].txId).toEqual(coin.txId);
      done();
    });

    it('should throw if the request failed', async (done) => {
      const coin = generateUnspentCoin(0);
      retryFetchSpy.and.callFake((uri: string) => {
        expect(uri).toContain('/coin/address/');
        return {
          status: httpStatus.BAD_REQUEST
        };
      });
      const verifyCode = randomString();
      spyOn(ReadableStream, 'readAll').and.returnValue(Promise.resolve(verifyCode));
      try {
        await bitcoinProcessor['getUnspentCoins'](coin.address);
        fail('should have thrown');
      } catch (error) {
        expect(error.message).toContain(verifyCode);
      } finally {
        done();
      }
    });

    it('should return empty if no coins were found', async (done) => {
      const coin = generateUnspentCoin(1);
      retryFetchSpy.and.callFake((uri: string) => {
        expect(uri).toContain('/coin/address/');
        return {
          status: httpStatus.OK
        };
      });
      const readStreamSpy = spyOn(ReadableStream, 'readAll').and.returnValue(Promise.resolve('[]'));
      const actual = await bitcoinProcessor['getUnspentCoins'](coin.address);
      expect(retryFetchSpy).toHaveBeenCalled();
      expect(readStreamSpy).toHaveBeenCalled();
      expect(actual).toEqual([]);
      done();
    });
  });

  describe('broadcastTransaction', () => {
    it('should serialize and broadcast a transaction', async (done) => {
      const transaction = generateBitcoinTransaction();
      // need to disable transaction serialization
      spyOn(transaction, 'serialize').and.callFake(() => transaction.toString());
      retryFetchSpy.and.callFake((uri: string, params: any) => {
        expect(uri).toContain('broadcast');
        expect(params.method).toEqual('post');
        expect(JSON.parse(params.body).tx).toEqual(transaction.toString());
        return Promise.resolve({
          status: httpStatus.OK
        });
      });
      const readStreamSpy = spyOn(ReadableStream, 'readAll').and.returnValue(Promise.resolve('{\
        "success": true\
      }'));
      const actual = await bitcoinProcessor['broadcastTransaction'](transaction);
      expect(actual).toBeTruthy();
      expect(retryFetchSpy).toHaveBeenCalled();
      expect(readStreamSpy).toHaveBeenCalled();
      done();
    });

    it('should throw if the request failed', async (done) => {
      const transaction = generateBitcoinTransaction();
      // need to disable transaction serialization
      spyOn(transaction, 'serialize').and.callFake(() => transaction.toString());
      retryFetchSpy.and.returnValue(Promise.resolve({
        status: httpStatus.BAD_REQUEST
      }));
      const readStreamSpy = spyOn(ReadableStream, 'readAll').and.returnValue(Promise.resolve(''));
      try {
        await bitcoinProcessor['broadcastTransaction'](transaction);
        fail('should have thrown');
      } catch (error) {
        expect(error.message).toContain('Broadcast failure');
        expect(retryFetchSpy).toHaveBeenCalled();
        expect(readStreamSpy).toHaveBeenCalled();
      } finally {
        done();
      }
    });

    it('should return false if the broadcast failed', async (done) => {
      const transaction = generateBitcoinTransaction();
      // need to disable transaction serialization
      spyOn(transaction, 'serialize').and.callFake(() => transaction.toString());
      retryFetchSpy.and.returnValue(Promise.resolve({
        status: httpStatus.OK
      }));
      const readStreamSpy = spyOn(ReadableStream, 'readAll').and.returnValue(Promise.resolve('{\
        "success": false\
      }'));
      const actual = await bitcoinProcessor['broadcastTransaction'](transaction);
      expect(actual).toBeFalsy();
      expect(retryFetchSpy).toHaveBeenCalled();
      expect(readStreamSpy).toHaveBeenCalled();
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
      const tipSpy = spyOn(bitcoinProcessor, 'getCurrentBlockHeight' as any).and.returnValue(Promise.resolve(startBlock.height + 1));
      const processMock = spyOn(bitcoinProcessor, 'processBlock' as any).and.returnValue(Promise.resolve(hash));
      await bitcoinProcessor['processTransactions'](startBlock);
      expect(verifySpy).toHaveBeenCalled();
      expect(tipSpy).toHaveBeenCalled();
      expect(processMock).toHaveBeenCalledTimes(2);
      done();
    });

    it('should use genesis if no start is specified', async (done) => {
      const verifySpy = spyOn(bitcoinProcessor, 'verifyBlock' as any);
      const tipSpy = spyOn(bitcoinProcessor, 'getCurrentBlockHeight' as any).and.returnValue(Promise.resolve(testConfig.genesisBlockNumber + 1));
      const processMock = spyOn(bitcoinProcessor, 'processBlock' as any).and.returnValue(Promise.resolve(randomString()));
      await bitcoinProcessor['processTransactions']();
      expect(verifySpy).not.toHaveBeenCalled();
      expect(tipSpy).toHaveBeenCalled();
      expect(processMock).toHaveBeenCalledTimes(2);
      done();
    });

    it('should throw if asked to start processing before genesis', async (done) => {
      const verifySpy = spyOn(bitcoinProcessor, 'verifyBlock' as any).and.returnValue(Promise.resolve(true));
      const tipSpy = spyOn(bitcoinProcessor, 'getCurrentBlockHeight' as any).and.returnValue(Promise.resolve(testConfig.genesisBlockNumber + 1));
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
      const tipSpy = spyOn(bitcoinProcessor, 'getCurrentBlockHeight' as any).and.returnValue(Promise.resolve(testConfig.genesisBlockNumber - 1));
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
      const firstValid = spyOn(bitcoinProcessor, 'firstValidTransaction').and.callFake((actualTransactions: ITransaction[]) => {
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
      const firstValid = spyOn(bitcoinProcessor, 'firstValidTransaction').and.callFake((actualTransactions: ITransaction[]) => {
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

  describe('getTip', () => {
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
      const mock = mockRpcCall('getblockbyheight', [height, true, false], { height, hash });
      const actual = await bitcoinProcessor['verifyBlock'](height, hash);
      expect(actual).toBeTruthy();
      expect(mock).toHaveBeenCalled();
      done();
    });

    it('should return false if the hash does not match given a block height', async (done) => {
      const height = randomNumber();
      const hash = randomString();
      const mock = mockRpcCall('getblockbyheight', [height, true, false], { height, hash: randomString() });
      const actual = await bitcoinProcessor['verifyBlock'](height, hash);
      expect(actual).toBeFalsy();
      expect(mock).toHaveBeenCalled();
      done();
    });
  });

  describe('processBlock', () => {

    // creates a response object for Bitcoin
    async function generateBlock (blockHeight: number, data?: () => string | undefined): Promise<any> {
      const tx: any[] = [];
      const count = randomNumber(100) + 10;
      for (let i = 0; i < count; i++) {
        const transaction = generateBitcoinTransaction(1, BitcoinProcessor.generatePrivateKey('testnet'));
        // data generation
        if (data) {
          const hasData = data();
          if (hasData) {
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
      const rpcMock = mockRpcCall('getblockbyheight', [block, true, true], blockData);
      let seenTransactionNumbers: number[] = [];
      const addTransaction = spyOn(bitcoinProcessor['transactionStore'],
        'addTransaction').and.callFake((sidetreeTransaction: ITransaction) => {
          expect(sidetreeTransaction.transactionTime).toEqual(block);
          expect(sidetreeTransaction.transactionTimeHash).toEqual(blockData.hash);
          expect(shouldFindIDs.includes(sidetreeTransaction.anchorFileHash)).toBeTruthy();
          shouldFindIDs.splice(shouldFindIDs.indexOf(sidetreeTransaction.anchorFileHash),1);
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
      const rpcMock = mockRpcCall('getblockbyheight', [block, true, true], blockData);
      let seenTransactionNumbers: number[] = [];
      const addTransaction = spyOn(bitcoinProcessor['transactionStore'],
        'addTransaction').and.callFake((sidetreeTransaction: ITransaction) => {
          expect(sidetreeTransaction.transactionTime).toEqual(block);
          expect(sidetreeTransaction.transactionTimeHash).toEqual(blockData.hash);
          expect(shouldFindIDs.includes(sidetreeTransaction.anchorFileHash)).toBeTruthy();
          shouldFindIDs.splice(shouldFindIDs.indexOf(sidetreeTransaction.anchorFileHash),1);
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
      const rpcMock = mockRpcCall('getblockbyheight', [block, true, true], blockData);
      const addTransaction = spyOn(bitcoinProcessor['transactionStore'],
        'addTransaction');
      const actual = await bitcoinProcessor['processBlock'](block);
      expect(actual).toEqual(blockData.hash);
      expect(rpcMock).toHaveBeenCalled();
      expect(addTransaction).not.toHaveBeenCalled();
      done();
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
        expect(uri).toContain(testConfig.bitcoinExtensionUri);
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
        return Promise.resolve(JSON.stringify({
          result,
          error: null,
          id: null
        }));
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
        expect(uri).toContain(testConfig.bitcoinExtensionUri);
        expect(params.method).toEqual('post');
        expect(JSON.parse(params.body).test).toEqual(request.test);
        return Promise.resolve({
          status: statusCode
        });
      });
      const readUtilSpy = spyOn(ReadableStream, 'readAll').and.callFake(() => {
        return Promise.resolve(result);
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
        expect(uri).toContain(testConfig.bitcoinExtensionUri);
        expect(params.method).toEqual('post');
        expect(JSON.parse(params.body).test).toEqual(request.test);
        return Promise.resolve({
          status: httpStatus.OK
        });
      });
      const readUtilSpy = spyOn(ReadableStream, 'readAll').and.callFake(() => {
        return Promise.resolve(JSON.stringify({
          result: null,
          error: result,
          id: null
        }));
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
        expect(fetchSpy).toHaveBeenCalledTimes(testConfig.maxRetries! + 1);
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
});

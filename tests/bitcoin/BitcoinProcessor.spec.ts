import { IBitcoinConfig } from '../../lib/bitcoin/IBitcoinConfig';
import { BitcoinProcessor } from '../../lib';
import TransactionNumber from '../../lib/bitcoin/TransactionNumber';
import { PrivateKey } from 'bitcore-lib';
import { ITransaction } from '../../lib/core/Transaction';
import * as httpStatus from 'http-status';
// import * as nodeFetchPackage from 'node-fetch';

function randomString (length: number = 16): string {
  return Math.round(Math.random() * Number.MAX_SAFE_INTEGER).toString(16).substring(0, length);
}

function randomNumber (max: number = 256): number {
  return Math.round(Math.random() * max);
}

describe('BitcoinProcessor', () => {

  const testConfig: IBitcoinConfig = {
    bitcoinExtensionUri: 'http://localhost:18331',
    bitcoinFee: 0,
    bitcoinWalletImportString: BitcoinProcessor.generatePrivateKey('testnet'),
    databaseName: 'bitcoin-test',
    defaultTimeoutInMilliseconds: 300,
    genesisBlockHash: '00000000000001571bc6faf951aeeb5edcbbd9fd3390be23f8ee7ccc2060d591',
    genesisBlockNumber: 1480000,
    lowBalanceNoticeInDays: 28,
    maxRetries: 3,
    maxSidetreeTransactions: 100,
    mongoDbConnectionString: 'mongodb://localhost:27017',
    sidetreeTransactionPrefix: 'sidetree:',
    transactionPollPeriodInSeconds: 60
  };

  let bitcoinProcessor: BitcoinProcessor;
  let transactionStoreInitializeSpy: jasmine.Spy;
  let transactionStoreLatestTransactionSpy: jasmine.Spy;
  let processTransactionsSpy: jasmine.Spy;
  let periodicPollSpy: jasmine.Spy;
  // let fetchSpy: jasmine.Spy;

  beforeEach(() => {
    bitcoinProcessor = new BitcoinProcessor(testConfig);
    transactionStoreInitializeSpy = spyOn(bitcoinProcessor['transactionStore'], 'initialize');
    transactionStoreLatestTransactionSpy = spyOn(bitcoinProcessor['transactionStore'], 'getLastTransaction');
    transactionStoreLatestTransactionSpy.and.returnValue(Promise.resolve(undefined));
    processTransactionsSpy = spyOn(bitcoinProcessor, 'processTransactions' as any);
    processTransactionsSpy.and.returnValue(Promise.resolve({ hash: 'IamAHash', height: 54321 }));
    periodicPollSpy = spyOn(bitcoinProcessor, 'periodicPoll' as any);
    // fetchSpy = spyOn(nodeFetchPackage, 'default');
  });

  /**
   *
   * @param method
   * @param params
   * @param returns
   * @param path
   */
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
        genesisBlockHash: randomString(),
        genesisBlockNumber: randomNumber(),
        maxSidetreeTransactions: randomNumber(),
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
      expect(bitcoinProcessor.genesisTimeHash).toEqual(config.genesisBlockHash);
      expect(TransactionNumber.getBlockNumber(bitcoinProcessor.genesisTransactionNumber)).toEqual(config.genesisBlockNumber);
      expect(bitcoinProcessor.lowBalanceNoticeDays).toEqual(28);
      expect(bitcoinProcessor.maxRetries).toEqual(3);
      expect(bitcoinProcessor.pageSize).toEqual(config.maxSidetreeTransactions);
      expect(bitcoinProcessor.pollPeriod).toEqual(60);
      expect(bitcoinProcessor.sidetreePrefix).toEqual(config.sidetreeTransactionPrefix);
      expect(bitcoinProcessor['transactionStore'].databaseName).toEqual(config.databaseName!);
      expect(bitcoinProcessor['transactionStore']['serverUrl']).toEqual(config.mongoDbConnectionString);
    });
  });

  describe('initialize', () => {
    it('should initialize the transactionStore', async () => {
      expect(transactionStoreInitializeSpy).not.toHaveBeenCalled();
      await bitcoinProcessor.initialize();
      expect(transactionStoreInitializeSpy).toHaveBeenCalled();
    });

    it('should process all the blocks since its last known', async () => {
      processTransactionsSpy.and.returnValue(Promise.resolve({
        hash: 'latestHash',
        height: 12345
      }));
      expect(processTransactionsSpy).not.toHaveBeenCalled();
      await bitcoinProcessor.initialize();
      expect(processTransactionsSpy).toHaveBeenCalled();

    });

    it('should begin to periodically poll for updates', async () => {
      expect(periodicPollSpy).not.toHaveBeenCalled();
      await bitcoinProcessor.initialize();
      expect(periodicPollSpy).toHaveBeenCalled();
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
    it('should get the current latest when given no hash', async () => {
      const height = randomNumber();
      const hash = randomString();
      const tipSpy = spyOn(bitcoinProcessor, 'getTip' as any).and.returnValue(Promise.resolve(height));
      const spy = mockRpcCall('getblockbyheight', [height, true, false], { hash, height });
      const actual = await bitcoinProcessor.time();
      expect(actual.time).toEqual(height);
      expect(actual.hash).toEqual(hash);
      expect(tipSpy).toHaveBeenCalled();
      expect(spy).toHaveBeenCalled();
    });

    it('should get the corresponding bitcoin height given a hash', async () => {
      const height = randomNumber();
      const hash = randomString();
      const spy = mockRpcCall('getblock', [hash, true, false], { hash, height });
      const actual = await bitcoinProcessor.time(hash);
      expect(actual.time).toEqual(height);
      expect(actual.hash).toEqual(hash);
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('transactions', () => {
    it('should get transactions since genesis limited by page size', async () => {
      const expectedTransactionNumber = TransactionNumber.construct(testConfig.genesisBlockNumber, 0);
      const verifyMock = spyOn(bitcoinProcessor, 'verifyBlock' as any).and.callFake((height: number, hash: string) => {
        expect(height).toEqual(testConfig.genesisBlockNumber);
        expect(hash).toEqual(testConfig.genesisBlockHash);
        return Promise.resolve(true);
      });
      const transactions = createTransactions();
      const laterThanMock = spyOn(bitcoinProcessor['transactionStore'], 'getTransactionsLaterThan').and.callFake(((since: number, pages: number) => {
        expect(since).toEqual(expectedTransactionNumber);
        expect(pages).toEqual(testConfig.maxSidetreeTransactions);
        return Promise.resolve(transactions);
      }));

      const actual = await bitcoinProcessor.transactions();
      expect(verifyMock).toHaveBeenCalled();
      expect(laterThanMock).toHaveBeenCalled();
      expect(actual.moreTransactions).toBeFalsy();
      expect(actual.transactions).toEqual(transactions);
    });

    it('should get transactions since a specific block height and hash', async () => {
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
    });

    it('should fail if only given a block height', async () => {
      try {
        await bitcoinProcessor.transactions(randomNumber());
        fail('expected to throw');
      } catch (error) {
        expect((error as any).status).toEqual(httpStatus.BAD_REQUEST);
      }
    });

    it('should fail if the height and hash do not validate against the current blockchain', async () => {
      const expectedHeight = randomNumber();
      const expectedHash = randomString();
      const expectedTransactionNumber = TransactionNumber.construct(expectedHeight, 0);
      const verifyMock = spyOn(bitcoinProcessor, 'verifyBlock' as any).and.returnValue(Promise.resolve(false));
      try {
        await bitcoinProcessor.transactions(expectedTransactionNumber, expectedHash);
        fail('expected to throw');
      } catch (error) {
        expect((error as any).status).toEqual(httpStatus.BAD_REQUEST);
      }
      expect(verifyMock).toHaveBeenCalled();
    });

    it('should handle moreTransactions parameter according to the returned page size', async () => {
      const expectedHeight = randomNumber();
      const expectedHash = randomString();
      const expectedTransactionNumber = TransactionNumber.construct(expectedHeight, 0);
      const verifyMock = spyOn(bitcoinProcessor, 'verifyBlock' as any).and.returnValue(Promise.resolve(true));
      const transactions = createTransactions(testConfig.maxSidetreeTransactions, expectedHeight);
      const laterThanMock = spyOn(bitcoinProcessor['transactionStore'], 'getTransactionsLaterThan').and.returnValue(Promise.resolve(transactions));
      const actual = await bitcoinProcessor.transactions(expectedTransactionNumber, expectedHash);
      expect(verifyMock).toHaveBeenCalled();
      expect(laterThanMock).toHaveBeenCalled();
      expect(actual.transactions).toEqual(transactions);
      expect(actual.moreTransactions).toBeTruthy();
    });
  });

  describe('firstValidTransaction', () => {
    it('should return the first of the valid transactions when given transactions out of order', async () => {
      throw new Error('not yet implemented');
    });
    it('should return undefined if no valid transactions are found', async () => {
      throw new Error('not yet implemented');
    });
  });

  describe('writeTransaction', () => {
    it('should write a transaction if there are enough Satoshis', async () => {
      throw new Error('not yet implemented');
    });

    it('should warn if the number of Satoshis are under the lowBalance calculation', async () => {
      throw new Error('not yet implemented');
    });

    it('should fail if there are not enough satoshis to create a transaction', async () => {
      throw new Error('not yet implemented');
    });
  });

  describe('getUnspentCoins', () => {
    it('should query for unspent output coins given an address', async () => {
      throw new Error('not yet implemented');
    });

    it('should throw if the request failed', async () => {
      throw new Error('not yet implemented');
    });

    it('should return empty if no coins were found', async () => {
      throw new Error('not yet implemented');
    });
  });

  describe('broadcastTransaction', () => {
    it('should serialize and broadcast a transaction', async () => {
      throw new Error('not yet implemented');
    });

    it('should throw if the request failed', async () => {
      throw new Error('not yet implemented');
    });

    it('should return false if the broadcast failed', async () => {
      throw new Error('not yet implemented');
    });
  });

  describe('periodicPoll', () => {
    it('should call processTransactions from its last known point', async () => {
      throw new Error('not yet implemented');
    });

    it('should set a timeout to call itself', async () => {
      throw new Error('not yet implemented');
    });
  });

  describe('processTransactions', () => {
    it('should verify the start block', async () => {
      throw new Error('not yet implemented');
    });

    it('should begin a rollback if the start block failed to validate', async () => {
      throw new Error('not yet implemented');
    });

    it('should call processBlock on all blocks within range', async () => {
      throw new Error('not yet implemented');
    });

    it('should use the current tip if no end is specified', async () => {
      throw new Error('not yet implemented');
    });
  });

  describe('revertBlockchainCache', () => {
    it('should exponentially revert transactions', async () => {
      throw new Error('not yet implemented');
    });

    it('should continue to revert if the first exponential revert failed', async () => {
      throw new Error('not yet implemented');
    });
  });

  describe('getTip', () => {
    it('should return the latest block', async () => {
      throw new Error('not yet implemented');
    });
  });

  describe('verifyBlock', () => {
    it('should return true if the hash matches given a block height', async () => {
      throw new Error('not yet implemented');
    });

    it('should return false if the hash does not match given a block height', async () => {
      throw new Error('not yet implemented');
    });
  });

  describe('processBlock', () => {
    it('should review all transactions in a block and add them to the transactionStore', async () => {
      throw new Error('not yet implemented');
    });

    it('should ignore other data transactions', async () => {
      throw new Error('not yet implemented');
    });
  });

  describe('rpcCall', () => {
    it('should make a request and return the result', async () => {
      throw new Error('not yet implemented');
    });
    it('should throw if the request failed', async () => {
      throw new Error('not yet implemented');
    });
    it('should throw if the RPC call failed', async () => {
      throw new Error('not yet implemented');
    });
  });

  describe('fetchWithRetry', () => {
    it('should fetch the URI with the given requestParameters', async () => {
      throw new Error('not yet implemented');
    });
    it('should retry with an extended time period if the request timed out', async () => {
      throw new Error('not yet implemented');
    });
    it('should stop retrying after the max retry limit', async () => {
      throw new Error('not yet implemented');
    });
    it('should throw non timeout errors immediately', async () => {
      throw new Error('not yet implemented');
    });
  });

  describe('waitFor', () => {
    it('should return after the given amount of time', async () => {
      throw new Error('not yet implemented');
    });
  });
});

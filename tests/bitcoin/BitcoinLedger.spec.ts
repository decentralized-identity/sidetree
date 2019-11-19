import * as httpStatus from 'http-status';
import * as nodeFetchPackage from 'node-fetch';
import BitcoinDataGenerator from './BitcoinDataGenerator';
import BitcoinLedger from '../../lib/bitcoin/BitcoinLedger';
import BitcoinProcessor from '../../lib/bitcoin/BitcoinProcessor';
import BlockData from '../../lib/bitcoin/models/BlockData';
import ReadableStream from '../../lib/common/ReadableStream';

describe('BitcoinLedger', async () => {

  let bitcoinLedger: BitcoinLedger;
  let fetchSpy: jasmine.Spy;
  let bitcoinWalletImportString: string;

  const bitcoinPeerUri = 'uri:someuri/';
  const maxRetries = 2;

  beforeEach(() => {
    bitcoinLedger = new BitcoinLedger(bitcoinPeerUri, 'u', 'p', 10, maxRetries);
    bitcoinWalletImportString = BitcoinProcessor.generatePrivateKey('testnet'),

    // this is always mocked to protect against actual calls to the bitcoin network
    fetchSpy = spyOn(nodeFetchPackage, 'default');
  });

  function mockRpcCall (method: string, params: any[], returns: any, path?: string): jasmine.Spy {
    return spyOn(bitcoinLedger, 'SendGenericRequest' as any).and.callFake((request: any, requestPath: string) => {
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

  describe('broadcastTransaction', () => {
    it('should serialize and broadcast a transaction', async (done) => {
      const transaction = BitcoinDataGenerator.generateBitcoinTransaction(bitcoinWalletImportString);
      // need to disable transaction serialization
      spyOn(transaction, 'serialize').and.callFake(() => transaction.toString());
      const spy = mockRpcCall('sendrawtransaction', [transaction.toString()], [transaction.toString()]);
      const actual = await bitcoinLedger.broadcastTransaction(transaction);
      expect(actual).toBeTruthy();
      expect(spy).toHaveBeenCalled();
      done();
    });

    it('should throw if the request failed', async (done) => {
      const transaction = BitcoinDataGenerator.generateBitcoinTransaction(bitcoinWalletImportString);
      // need to disable transaction serialization
      spyOn(transaction, 'serialize').and.callFake(() => transaction.toString());
      const spy = mockRpcCall('sendrawtransaction', [transaction.toString()], [transaction.toString()]);
      spy.and.throwError('test');
      try {
        await bitcoinLedger.broadcastTransaction(transaction);
        fail('should have thrown');
      } catch (error) {
        expect(error.message).toContain('test');
        expect(spy).toHaveBeenCalled();
      } finally {
        done();
      }
    });

    it('should return false if the broadcast failed', async (done) => {
      const transaction = BitcoinDataGenerator.generateBitcoinTransaction(bitcoinWalletImportString);
      // need to disable transaction serialization
      spyOn(transaction, 'serialize').and.callFake(() => transaction.toString());
      const spy = mockRpcCall('sendrawtransaction', [transaction.toString()], []);
      const actual = await bitcoinLedger.broadcastTransaction(transaction);
      expect(actual).toBeFalsy();
      expect(spy).toHaveBeenCalled();
      done();
    });
  });

  describe('getBlock', () => {
    it('should get the block data.', async () => {
      const hash = 'block_hash';
      const verbosity = 1;
      const blockData: BlockData = {
        hash: 'some hash',
        height: 2,
        transactions: []
      };

      const spy = mockRpcCall('getblock', [hash, verbosity], blockData);
      const actual = await bitcoinLedger.getBlock(hash, verbosity);

      expect(spy).toHaveBeenCalled();
      expect(actual).toEqual(blockData);
    });
  });

  describe('getBlockHash', () => {
    it('should get the block hash', async () => {
      const height = 512;
      const hash = 'ADSFSAEF34359';
      const spy = mockRpcCall('getblockhash', [height], hash);
      const actual = await bitcoinLedger.getBlockHash(height);
      expect(actual).toEqual(hash);
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('getCurrentBlockHeight', () => {
    it('should return the latest block', async (done) => {
      const height = 753;
      const mock = mockRpcCall('getblockcount', [], height);
      const actual = await bitcoinLedger.getCurrentBlockHeight();
      expect(actual).toEqual(height);
      expect(mock).toHaveBeenCalled();
      done();
    });
  });

  describe('getUnspentCoins', () => {
    it('should query for unspent output coins given an address', async (done) => {
      const coin = BitcoinDataGenerator.generateUnspentCoin(bitcoinWalletImportString, 1);

      const coinSpy = mockRpcCall('listunspent', [null, null, [coin.address.toString()]], [
        {
          txId: coin.txId,
          outputIndex: coin.outputIndex,
          address: coin.address,
          script: coin.script,
          satoshis: coin.satoshis
        }
      ]);
      const actual = await bitcoinLedger.getUnspentCoins(coin.address);
      expect(coinSpy).toHaveBeenCalled();
      expect(actual[0].address).toEqual(coin.address);
      expect(actual[0].txId).toEqual(coin.txId);
      done();
    });

    it('should return empty if no coins were found', async (done) => {
      const coin = BitcoinDataGenerator.generateUnspentCoin(bitcoinWalletImportString, 1);
      const coinSpy = mockRpcCall('listunspent', [null, null, [coin.address.toString()]], []);
      const actual = await bitcoinLedger.getUnspentCoins(coin.address);
      expect(coinSpy).toHaveBeenCalled();
      expect(actual).toEqual([]);
      done();
    });
  });

  describe('walletExists', () => {
    it('should check if the wallet is watch only', async () => {
      const address = 'ADSFAEADSF0934ADF';
      const spy = mockRpcCall('getaddressinfo', [address], {
        address,
        scriptPubKey: 'afdoijEAFDSDF',
        ismine: false,
        solvable: true,
        desc: 'Test Address data',
        iswatchonly: true,
        isscript: false,
        iswitness: false,
        pubkey: 'random_pubkey_name',
        iscompressed: true,
        ischange: false,
        timestamp: 0,
        labels: []
      });
      const actual = await bitcoinLedger.walletExists(address);
      expect(actual).toBeTruthy();
      expect(spy).toHaveBeenCalled();
    });

    it('should check if the wallet has labels', async () => {
      const address = 'some_ADDRESS_string';
      const spy = mockRpcCall('getaddressinfo', [address], {
        address,
        scriptPubKey: 'script_pubkey_random',
        ismine: false,
        solvable: true,
        desc: 'Test Address data',
        iswatchonly: false,
        isscript: false,
        iswitness: false,
        pubkey: 'pubkey_random_value',
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
      const actual = await bitcoinLedger.walletExists(address);
      expect(actual).toBeTruthy();
      expect(spy).toHaveBeenCalled();
    });

    it('should return false if it appears to be a random address', async () => {
      const address = 'random-ADDress';
      const spy = mockRpcCall('getaddressinfo', [address], {
        address,
        scriptPubKey: 'script_pubKEY_random',
        ismine: false,
        solvable: false,
        iswatchonly: false,
        isscript: true,
        iswitness: false,
        ischange: false,
        labels: []
      });
      const actual = await bitcoinLedger.walletExists(address);
      expect(actual).toBeFalsy();
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('SendGenericRequest', () => {
    it('should call retry-fetch', async (done) => {
      const request: any = {};
      const memberName = 'memberRequestName';
      const memberValue = 'memberRequestValue';
      request[memberName] = memberValue;
      const bodyIdentifier = 12345;
      const result = 'some_result';

      const retryFetchSpy = spyOn(bitcoinLedger as any, 'fetchWithRetry');
      retryFetchSpy.and.callFake((uri: string, params: any) => {
        expect(uri).toContain(bitcoinPeerUri);
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

      const actual = await bitcoinLedger['SendGenericRequest'](request, true);
      expect(actual).toEqual(result);
      expect(retryFetchSpy).toHaveBeenCalled();
      expect(readUtilSpy).toHaveBeenCalled();
      done();
    });

    it('should throw if the request failed', async (done) => {
      const request: any = {
        'test': 'some random string'
      };
      const result = 'some result';
      const statusCode = 7890;

      const retryFetchSpy = spyOn(bitcoinLedger as any, 'fetchWithRetry');
      retryFetchSpy.and.callFake((uri: string, params: any) => {
        expect(uri).toContain(bitcoinPeerUri);
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
        await bitcoinLedger['SendGenericRequest'](request, true);
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
        'test': 'some request value'
      };
      const result = 'some result';

      const retryFetchSpy = spyOn(bitcoinLedger as any, 'fetchWithRetry');
      retryFetchSpy.and.callFake((uri: string, params: any) => {
        expect(uri).toContain(bitcoinPeerUri);
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
        await bitcoinLedger['SendGenericRequest'](request, true);
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

    it('should fetch the URI with the given requestParameters', async (done) => {
      const path = 'http://some_random_path';
      const request: any = {
        headers: {}
      };
      const memberName = 'headerMember';
      const memberValue = 'headerValue';
      request.headers[memberName] = memberValue;
      const result = 200;

      fetchSpy.and.callFake((uri: string, params: any) => {
        expect(uri).toEqual(path);
        expect(params.headers[memberName]).toEqual(memberValue);
        return Promise.resolve(result);
      });

      const actual = await bitcoinLedger['fetchWithRetry'](path, request);
      expect(actual as any).toEqual(result);
      expect(fetchSpy).toHaveBeenCalled();
      done();
    });

    it('should retry with an extended time period if the request timed out', async (done) => {
      const requestId = 'someRequestId';
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

      await bitcoinLedger['fetchWithRetry']('localhost', { headers: { id: requestId } });

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      done();
    });

    it('should stop retrying after the max retry limit', async (done) => {
      fetchSpy.and.callFake((_: any, __: any) => {
        return Promise.reject(new nodeFetchPackage.FetchError('test', 'request-timeout'));
      });

      try {
        await bitcoinLedger['fetchWithRetry']('localhost');
      } catch (error) {
        expect(error.message).toEqual('test');
        expect(error.type).toEqual('request-timeout');
        expect(fetchSpy).toHaveBeenCalledTimes(maxRetries + 1);
      } finally {
        done();
      }
    });

    it('should throw non timeout errors immediately', async (done) => {
      let timeout = true;
      const result = 'some random result';
      fetchSpy.and.callFake((_: any, __: any) => {
        if (timeout) {
          timeout = false;
          return Promise.reject(new nodeFetchPackage.FetchError('test', 'request-timeout'));
        } else {
          return Promise.reject(new Error(result));
        }
      });
      try {
        await bitcoinLedger['fetchWithRetry']('localhost');
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

      await bitcoinLedger['waitFor'](400);
      expect(approved).toBeTruthy();
      done();
    }, 500);
  });

});

import * as httpStatus from 'http-status';
import * as nodeFetchPackage from 'node-fetch';
import BitcoinDataGenerator from './BitcoinDataGenerator';
import BitcoinClient from '../../lib/bitcoin/BitcoinClient';
import BitcoinTransactionModel from '../../lib/bitcoin/models/BitcoinTransactionModel';
import ReadableStream from '../../lib/common/ReadableStream';
import { PrivateKey, Transaction, Address } from 'bitcore-lib';

describe('BitcoinClient', async () => {

  let bitcoinClient: BitcoinClient;
  let fetchSpy: jasmine.Spy;
  let bitcoinWalletImportString: string;
  let privateKeyFromBitcoinClient: PrivateKey;
  let privateKeyAddressFromBitcoinClient: Address;

  const bitcoinPeerUri = 'uri:someuri/';
  const maxRetries = 2;

  beforeEach(() => {
    bitcoinWalletImportString = BitcoinClient.generatePrivateKey('testnet');
    bitcoinClient = new BitcoinClient(bitcoinPeerUri, 'u', 'p', bitcoinWalletImportString, 10, maxRetries);

    privateKeyFromBitcoinClient = bitcoinClient['privateKey'];
    privateKeyAddressFromBitcoinClient = bitcoinClient['privateKeyAddress'];

    // this is always mocked to protect against actual calls to the bitcoin network
    fetchSpy = spyOn(nodeFetchPackage, 'default');
  });

  function mockRpcCall (method: string, params: any[], returns: any, path?: string): jasmine.Spy {
    return spyOn(bitcoinClient, 'rpcCall' as any).and.callFake((request: any, requestPath: string) => {
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

  describe('generatePrivateKey', () => {
    it('should construct a PrivateKey and export its WIF', () => {
      const privateKey = BitcoinClient.generatePrivateKey('testnet');
      expect(privateKey).toBeDefined();
      expect(typeof privateKey).toEqual('string');
      expect(privateKey.length).toBeGreaterThan(0);
      expect(() => {
        (PrivateKey as any).fromWIF(privateKey);
      }).not.toThrow();
    });
  });

  describe('initialize', () => {
    it('should import key if the wallet does not exist', async () => {
      const walletExistsSpy = spyOn(bitcoinClient as any, 'isAddressAddedToWallet').and.returnValue(Promise.resolve(false));
      const publicKeyHex = privateKeyFromBitcoinClient.toPublicKey().toBuffer().toString('hex');

      const importSpy = spyOn(bitcoinClient as any, 'addWatchOnlyAddressToWallet').and.callFake((key: string, rescan: boolean) => {
        expect(key).toEqual(publicKeyHex);
        expect(rescan).toBeTruthy();

        return Promise.resolve(undefined);
      });

      await bitcoinClient.initialize();
      expect(walletExistsSpy).toHaveBeenCalled();
      expect(importSpy).toHaveBeenCalled();
    });
  });

  describe('broadcastTransaction', () => {
    it('should serialize and broadcast a transaction', async (done) => {
      const transaction = BitcoinDataGenerator.generateBitcoinTransaction(bitcoinWalletImportString);
      const transactionToString = transaction.toString();

      spyOn(transaction, 'serialize').and.returnValue(transactionToString);

      spyOn(bitcoinClient as any, 'createBitcoreTransaction').and.returnValue(Promise.resolve(transaction));

      const spy = mockRpcCall('sendrawtransaction', [transactionToString], transactionToString);
      const actual = await bitcoinClient.broadcastTransaction('data to write', 1000);
      expect(actual).toEqual(transactionToString);
      expect(spy).toHaveBeenCalled();
      done();
    });

    it('should throw if the RPC call fails.', async (done) => {
      const transaction = BitcoinDataGenerator.generateBitcoinTransaction(bitcoinWalletImportString);
      spyOn(transaction, 'serialize').and.returnValue(transaction.toString());

      spyOn(bitcoinClient as any, 'createBitcoreTransaction').and.returnValue(Promise.resolve(transaction));

      const spy = mockRpcCall('sendrawtransaction', [transaction.toString()], [transaction.toString()]);
      spy.and.throwError('test');
      try {
        await bitcoinClient.broadcastTransaction('data to write', 1000);
        fail('should have thrown');
      } catch (error) {
        expect(error.message).toContain('test');
        expect(spy).toHaveBeenCalled();
      } finally {
        done();
      }
    });
  });

  describe('getBlock', () => {
    it('should get the block data.', async () => {
      const transaction = BitcoinDataGenerator.generateBitcoinTransaction(bitcoinWalletImportString);
      const hash = 'block_hash';

      const blockData = {
        hash: hash,
        height: 2,
        transactions: [transaction],
        header: {
          prevHash: 'some other hash'
        }
      };

      spyOn(BitcoinClient as any, 'createBitcoreBlockFromBuffer').and.returnValue(blockData);
      const spy = mockRpcCall('getblock', [hash, 0], JSON.stringify(blockData));
      const actual = await bitcoinClient.getBlock(hash);

      expect(spy).toHaveBeenCalled();
      expect(actual.hash).toEqual(blockData.hash);
      expect(actual.height).toEqual(blockData.height);
      expect(actual.previousHash).toEqual(blockData.header.prevHash);
      expect(actual.transactions[0]).toEqual(BitcoinClient['createBitcoinTransactionModel'](transaction));
    });
  });

  describe('getBlockHash', () => {
    it('should get the block hash', async () => {
      const height = 512;
      const hash = 'ADSFSAEF34359';
      const spy = mockRpcCall('getblockhash', [height], hash);
      const actual = await bitcoinClient.getBlockHash(height);
      expect(actual).toEqual(hash);
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('getBlockInfo', () => {
    it('should get the block info', async () => {
      const height = 1234;
      const hash = 'some hash value';
      const previousHash = Math.round(Math.random() * Number.MAX_SAFE_INTEGER).toString(32);
      const spy = mockRpcCall('getblockheader', [hash, true], { height: height, previousblockhash: previousHash });
      const actual = await bitcoinClient.getBlockInfo(hash);
      expect(actual.hash).toEqual(hash);
      expect(actual.height).toEqual(height);
      expect(actual.previousHash).toEqual(previousHash);
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('getBlockInfoFromHeight', () => {
    it('should get the block info', async () => {
      const height = Math.round(Math.random() * Number.MAX_SAFE_INTEGER);
      const hash = 'some hash value';
      const previousHash = 'some other hash';
      const heightSpy = spyOn(bitcoinClient, 'getBlockHash').and.callFake((calledHeight: number) => {
        expect(calledHeight).toEqual(height);
        return Promise.resolve(hash);
      });
      const spy = mockRpcCall('getblockheader', [hash, true], { height: height, previousblockhash: previousHash });
      const actual = await bitcoinClient.getBlockInfoFromHeight(height);
      expect(actual.hash).toEqual(hash);
      expect(actual.height).toEqual(height);
      expect(actual.previousHash).toEqual(previousHash);
      expect(spy).toHaveBeenCalled();
      expect(heightSpy).toHaveBeenCalled();
    });
  });

  describe('getCurrentBlockHeight', () => {
    it('should return the latest block', async (done) => {
      const height = 753;
      const mock = mockRpcCall('getblockcount', [], height);
      const actual = await bitcoinClient.getCurrentBlockHeight();
      expect(actual).toEqual(height);
      expect(mock).toHaveBeenCalled();
      done();
    });
  });

  describe('getRawTransaction', () => {
    it('should make the correct rpc call and return the transaction object', async () => {
      const txnId = 'transaction_id';
      const mockTransaction: Transaction = BitcoinDataGenerator.generateBitcoinTransaction(bitcoinWalletImportString, 50);
      const mockTransactionAsOutputTxn = BitcoinClient['createBitcoinTransactionModel'](mockTransaction);

      spyOn(BitcoinClient as any, 'createBitcoreTransactionFromBuffer').and.returnValue(mockTransaction);

      const spy = mockRpcCall('getrawtransaction', [txnId, 0], mockTransaction.toString());

      const actual = await bitcoinClient['getRawTransaction'](txnId);
      expect(actual).toEqual(mockTransactionAsOutputTxn);
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('getTransactionOutValueInSatoshi', () => {
    it('should return the satoshis from the correct output index.', async () => {
      const mockTxnWithMultipleOutputs: BitcoinTransactionModel = {
        id: 'someid',
        inputs: [],
        outputs: [
          { satoshis: 100, scriptAsmAsString: 'script1' },
          { satoshis: 200, scriptAsmAsString: 'script2' }
        ]
      };

      spyOn(bitcoinClient as any, 'getRawTransaction').and.returnValue(Promise.resolve(mockTxnWithMultipleOutputs));

      const outputFromZeroIdx = await bitcoinClient['getTransactionOutValueInSatoshi']('someId', 0);
      expect(outputFromZeroIdx).toEqual(100);

      const outputFromOneIdx = await bitcoinClient['getTransactionOutValueInSatoshi']('someId', 1);
      expect(outputFromOneIdx).toEqual(200);
    });
  });

  describe('getTransactionFeeInSatoshis', () => {
    it('should return the inputs - outputs.', async () => {
      const mockTxn: BitcoinTransactionModel = {
        id: 'someid',
        inputs: [
          { previousTransactionId: 'prevTxnId', outputIndexInPreviousTransaction: 0 }
        ],
        outputs: [
          { satoshis: 100, scriptAsmAsString: 'script1' },
          { satoshis: 200, scriptAsmAsString: 'script2' }
        ]
      };

      const mockTxnOutputsSum = 300; // manually calculated based on the mockTxn above
      const mockInputsSum = 500;

      spyOn(bitcoinClient as any, 'getRawTransaction').and.returnValue(Promise.resolve(mockTxn));
      spyOn(bitcoinClient as any, 'getTransactionOutValueInSatoshi').and.returnValue(Promise.resolve(mockInputsSum));

      const actual = await bitcoinClient.getTransactionFeeInSatoshis('someid');
      expect(actual).toEqual(mockInputsSum - mockTxnOutputsSum);
    });
  });

  describe('getUnspentOutputs', () => {
    it('should query for unspent output coins given an address', async (done) => {
      const coin = BitcoinDataGenerator.generateUnspentCoin(bitcoinWalletImportString, 1);

      const coinSpy = mockRpcCall('listunspent', [null, null, [privateKeyAddressFromBitcoinClient.toString()]], [
        {
          txId: coin.txId,
          outputIndex: coin.outputIndex,
          address: coin.address,
          script: coin.script,
          satoshis: coin.satoshis
        }
      ]);
      const actual = await bitcoinClient['getUnspentOutputs'](privateKeyAddressFromBitcoinClient);
      expect(coinSpy).toHaveBeenCalled();
      expect(actual[0].satoshis).toEqual(coin.satoshis);
      done();
    });

    it('should return empty if no coins were found', async (done) => {
      const coinSpy = mockRpcCall('listunspent', [null, null, [privateKeyAddressFromBitcoinClient.toString()]], []);
      const actual = await bitcoinClient['getUnspentOutputs'](privateKeyAddressFromBitcoinClient);
      expect(coinSpy).toHaveBeenCalled();
      expect(actual).toEqual([]);
      done();
    });
  });

  describe('addWatchOnlyAddressToWallet', () => {
    it('should call the importpubkey API', async (done) => {
      const publicKeyAsHex = 'some dummy value';
      const rescan = true;
      const spy = mockRpcCall('importpubkey', [publicKeyAsHex, 'sidetree', rescan], []);

      await bitcoinClient['addWatchOnlyAddressToWallet'](publicKeyAsHex, rescan);
      expect(spy).toHaveBeenCalled();
      done();
    });
  });

  describe('createBitcoreTransaction', () => {
    it('should create the transaction object using the inputs correctly.', async (done) => {
      const availableSatoshis = 5000;
      const unspentCoin = BitcoinDataGenerator.generateUnspentCoin(bitcoinWalletImportString, availableSatoshis);
      const unspentOutputs = [
        {
          txId: unspentCoin.txId,
          outputIndex: unspentCoin.outputIndex,
          address: unspentCoin.address,
          script: unspentCoin.script,
          satoshis: unspentCoin.satoshis
        }
      ];

      spyOn(bitcoinClient as any, 'getUnspentOutputs').and.returnValue(Promise.resolve(unspentOutputs));
      const dataToWrite = 'data to write';
      const dataToWriteInHex = Buffer.from(dataToWrite).toString('hex');
      const fee = availableSatoshis / 2;

      const transaction = await bitcoinClient['createBitcoreTransaction'](dataToWrite, fee);
      expect(transaction.getFee()).toEqual(fee);
      expect(transaction.outputs[0].script.toASM()).toContain(dataToWriteInHex);
      done();
    });
  });

  describe('getBalanceInSatoshis', () => {
    it('should call the unspentoutput API', async (done) => {
      const mockUnspentOutput = {
        satoshis: 12345
      };

      spyOn(bitcoinClient as any, 'getUnspentOutputs').and.returnValue([mockUnspentOutput, mockUnspentOutput]);
      const actual = await bitcoinClient.getBalanceInSatoshis();
      expect(actual).toEqual(mockUnspentOutput.satoshis * 2);
      done();
    });
  });

  describe('isAddressAddedToWallet', () => {
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
      const actual = await bitcoinClient['isAddressAddedToWallet'](address);
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
      const actual = await bitcoinClient['isAddressAddedToWallet'](address);
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
      const actual = await bitcoinClient['isAddressAddedToWallet'](address);
      expect(actual).toBeFalsy();
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('rpcCall', () => {
    it('should call retry-fetch', async (done) => {
      const request: any = {};
      const memberName = 'memberRequestName';
      const memberValue = 'memberRequestValue';
      request[memberName] = memberValue;
      const bodyIdentifier = 12345;
      const result = 'some_result';

      const retryFetchSpy = spyOn(bitcoinClient as any, 'fetchWithRetry');
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

      const actual = await bitcoinClient['rpcCall'](request, true);
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

      const retryFetchSpy = spyOn(bitcoinClient as any, 'fetchWithRetry');
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
        await bitcoinClient['rpcCall'](request, true);
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

      const retryFetchSpy = spyOn(bitcoinClient as any, 'fetchWithRetry');
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
        await bitcoinClient['rpcCall'](request, true);
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

      const actual = await bitcoinClient['fetchWithRetry'](path, request);
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

      await bitcoinClient['fetchWithRetry']('localhost', { headers: { id: requestId } });

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      done();
    });

    it('should stop retrying after the max retry limit', async (done) => {
      fetchSpy.and.callFake((_: any, __: any) => {
        return Promise.reject(new nodeFetchPackage.FetchError('test', 'request-timeout'));
      });

      try {
        await bitcoinClient['fetchWithRetry']('localhost');
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
        await bitcoinClient['fetchWithRetry']('localhost');
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

      await bitcoinClient['waitFor'](400);
      expect(approved).toBeTruthy();
      done();
    }, 500);
  });

});

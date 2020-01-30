import * as httpStatus from 'http-status';
import * as nodeFetchPackage from 'node-fetch';
import BitcoinDataGenerator from './BitcoinDataGenerator';
import BitcoinClient from '../../lib/bitcoin/BitcoinClient';
import BitcoinTransactionModel from '../../lib/bitcoin/models/BitcoinTransactionModel';
import ReadableStream from '../../lib/common/ReadableStream';
import { Address, PrivateKey, Script, Transaction } from 'bitcore-lib';

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
        tx: [
          { hex: Buffer.from(transaction.toString()).toString('hex') }
        ],
        previousblockhash: 'some other hash'
      };

      spyOn(BitcoinClient as any, 'createBitcoreTransactionFromBuffer').and.returnValue(transaction);
      const spy = mockRpcCall('getblock', [hash, 2], blockData);
      const actual = await bitcoinClient.getBlock(hash);

      expect(spy).toHaveBeenCalled();
      expect(actual.hash).toEqual(blockData.hash);
      expect(actual.height).toEqual(blockData.height);
      expect(actual.previousHash).toEqual(blockData.previousblockhash);
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

  describe('getCurrentEstimatedFeeInSatoshisPerKb', () => {
    it('should call the correct rpc and return the fee', async () => {
      const mockFeeInBitcoins = 155;
      const spy = mockRpcCall('estimatesmartfee', [1], { feerate: mockFeeInBitcoins });

      const expectedFeeInSatoshis = mockFeeInBitcoins * 100000000;

      const actual = await bitcoinClient['getCurrentEstimatedFeeInSatoshisPerKb']();
      expect(actual).toEqual(expectedFeeInSatoshis);
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

  describe('calculateTransactionFee', () => {
    it('should calculate the fee correctly', async () => {
      let estimatedFee = 1000;
      spyOn(bitcoinClient as any, 'getCurrentEstimatedFeeInSatoshisPerKb').and.returnValue(estimatedFee);

      const mockTransaction = BitcoinDataGenerator.generateBitcoinTransaction(bitcoinWalletImportString, 10000);

      let txnEstimatedSize = (mockTransaction.inputs.length * 150) + (mockTransaction.outputs.length * 50);
      txnEstimatedSize += txnEstimatedSize * .2;
      estimatedFee += estimatedFee * .2;

      const expectedFee = (txnEstimatedSize / 1000) * estimatedFee;
      const actualFee = await bitcoinClient['calculateTransactionFee'](mockTransaction);

      expect(expectedFee).toEqual(actualFee);
    });
  });

  describe('createFreezeBitcoreTransaction', () => {
    it('should create the freeze transaction correctly', async () => {
      const mockFreezeUntilBlock = 987654;
      const mockFreezeAmount = 1000;

      const mockRedeemScript = Script.empty().add(117);
      const mockRedeemScriptHash = Script.buildScriptHashOut(mockRedeemScript);

      const mockUnspentOutput = BitcoinDataGenerator.generateUnspentCoin(bitcoinWalletImportString, Math.pow(10, 8));

      const mockTxnFee = 2000;
      const createScriptSpy = spyOn(bitcoinClient as any, 'createFreezeBitcoreScript').and.returnValue(mockRedeemScript);
      const estimateFeeSpy = spyOn(bitcoinClient as any, 'calculateTransactionFee').and.returnValue(mockTxnFee);

      const actual = await bitcoinClient['createFreezeBitcoreTransaction']([mockUnspentOutput], mockFreezeUntilBlock, mockFreezeAmount);

      expect(actual.getFee()).toEqual(mockTxnFee);

      // There should be 2 outputs
      expect(actual.outputs.length).toEqual(2);

      // 1st output is the freeze output
      expect(actual.outputs[0].satoshis).toEqual(mockFreezeAmount);
      expect(actual.outputs[0].script.toASM()).toEqual(mockRedeemScriptHash.toASM());

      // 2nd output is the difference back to this wallet and this should be the
      // 'change' script === where the rest of the satoshis will go
      const expectedPayToScript = Script.buildPublicKeyHashOut(privateKeyFromBitcoinClient.toAddress());
      expect(actual.outputs[1].script.toASM()).toEqual(expectedPayToScript.toASM());
      expect(actual.getChangeOutput()).toEqual(actual.outputs[1]);

      expect(createScriptSpy).toHaveBeenCalledWith(mockFreezeUntilBlock);
      expect(estimateFeeSpy).toHaveBeenCalled();
    });
  });

  describe('createSpendToFreezeBitcoreTransaction', () => {
    it('should return the transaction by the utility function', async () => {
      const mockFreezeTxn1 = BitcoinDataGenerator.generateBitcoinTransaction(bitcoinWalletImportString, 12345);
      const mockFreezeTxn2 = BitcoinDataGenerator.generateBitcoinTransaction(bitcoinWalletImportString, 7890);
      const mockFreezeUntilPreviousBlock = 12345;
      const mockFreezeUntilBlock = 987654;

      const mockRedeemScript = Script.empty().add(117);
      const mockRedeemScriptHash = Script.buildScriptHashOut(mockRedeemScript);

      const createScriptSpy = spyOn(bitcoinClient as any, 'createFreezeBitcoreScript').and.returnValue(mockRedeemScript);
      const utilFuncSpy = spyOn(bitcoinClient as any, 'createSpendBitcoreTransactionFromFrozenTransaction').and.returnValue(mockFreezeTxn2);

      const actual = await bitcoinClient['createSpendToFreezeBitcoreTransaction'](mockFreezeTxn1, mockFreezeUntilPreviousBlock, mockFreezeUntilBlock);
      expect(actual).toEqual(mockFreezeTxn2);
      expect(createScriptSpy).toHaveBeenCalledWith(mockFreezeUntilBlock);

      const expectedPayToScriptAddress = new Address(mockRedeemScriptHash);
      expect(utilFuncSpy).toHaveBeenCalledWith(mockFreezeTxn1, mockFreezeUntilPreviousBlock, expectedPayToScriptAddress);
    });
  });

  describe('createSpendToWalletBitcoreTransaction', () => {
    it('should return the transaction by the utility function', async () => {
      const mockFreezeTxn1 = BitcoinDataGenerator.generateBitcoinTransaction(bitcoinWalletImportString, 12345);
      const mockFreezeTxn2 = BitcoinDataGenerator.generateBitcoinTransaction(bitcoinWalletImportString, 7890);
      const mockFreezeUntilBlock = 987654;

      const utilFuncSpy = spyOn(bitcoinClient as any, 'createSpendBitcoreTransactionFromFrozenTransaction').and.returnValue(mockFreezeTxn2);

      const actual = await bitcoinClient['createSpendToWalletBitcoreTransaction'](mockFreezeTxn1, mockFreezeUntilBlock);
      expect(actual).toEqual(mockFreezeTxn2);
      expect(utilFuncSpy).toHaveBeenCalledWith(mockFreezeTxn1, mockFreezeUntilBlock, privateKeyAddressFromBitcoinClient);
    });
  });

  describe('createSpendBitcoreTransactionFromFrozenTransaction', () => {
    it('should create the spend transaction correctly', async () => {
      const mockFreezeTxn = BitcoinDataGenerator.generateBitcoinTransaction(bitcoinWalletImportString, 12345);
      const mockFreezeUntilBlock = 987654;

      const mockPayToAddress = privateKeyAddressFromBitcoinClient;
      const mockPayToAddressScriptHash = Script.buildPublicKeyHashOut(mockPayToAddress);

      const mockRedeemScript = Script.empty().add(117);
      const mockRedeemScriptHash = Script.buildScriptHashOut(mockRedeemScript);

      const mockUnspentOutput = Transaction.UnspentOutput.fromObject({
        txid: mockFreezeTxn.id, vout: 3, scriptPubKey: mockRedeemScriptHash, satoshis: 456789
      });

      const mockTxnFee = 21897;

      const createUnspentSpy = spyOn(bitcoinClient as any, 'createBitcoreUnspentOutputFromFrozenTransaction').and.returnValue(mockUnspentOutput);
      const createScriptSpy = spyOn(bitcoinClient as any, 'createFreezeBitcoreScript').and.returnValue(mockRedeemScript);
      const estimateFeeSpy = spyOn(bitcoinClient as any, 'calculateTransactionFee').and.returnValue(mockTxnFee);

      const actual = await bitcoinClient['createSpendBitcoreTransactionFromFrozenTransaction'](mockFreezeTxn, mockFreezeUntilBlock, mockPayToAddress);

      // Txn should go into the unlock block
      expect(actual.getLockTime()).toEqual(mockFreezeUntilBlock);

      // Output should be to the mock address passed in
      expect(actual.outputs.length).toEqual(1);
      expect(actual.outputs[0].script.toASM()).toEqual(mockPayToAddressScriptHash.toASM());

      // The fee should be correctly set as per the estimate
      expect(actual.getFee()).toEqual(mockTxnFee);

      // There's only 1 input (from the previous freeze txn)
      expect(actual.inputs.length).toEqual(1);
      expect(actual.inputs[0].prevTxId.toString('hex')).toEqual(mockUnspentOutput.txId);
      expect(actual.inputs[0].outputIndex).toEqual(mockUnspentOutput.outputIndex);

      // The input script should have 3 parts: signature, public key of the bitcoinClient.privateKey, and redeem script
      const inputScriptAsm = actual.inputs[0].script.toASM();
      const inputScriptAsmParts = inputScriptAsm.split(' ');

      expect(inputScriptAsmParts.length).toEqual(3);
      expect(inputScriptAsmParts[0].length).toBeGreaterThan(0); // Signature
      expect(inputScriptAsmParts[1]).toEqual(bitcoinClient['privateKey'].toPublicKey().toBuffer().toString('hex'));
      expect(inputScriptAsmParts[2]).toEqual(mockRedeemScript.toBuffer().toString('hex'));

      // Check other function calls
      expect(createUnspentSpy).toHaveBeenCalledWith(mockFreezeTxn, mockFreezeUntilBlock);
      expect(createScriptSpy).toHaveBeenCalledWith(mockFreezeUntilBlock);
      expect(estimateFeeSpy).toHaveBeenCalled();
    });
  });

  describe('createBitcoreUnspentOutputFromFrozenTransaction', () => {
    it('should create unspent output from input transaction', async () => {
      const mockFreezeTxn = BitcoinDataGenerator.generateBitcoinTransaction(bitcoinWalletImportString, 12345);
      const mockFreezeUntilBlock = 987654;
      const mockRedeemScript = Script.empty().add(117);
      const mockRedeemScriptHash = Script.buildScriptHashOut(mockRedeemScript);

      const createScriptSpy = spyOn(bitcoinClient as any, 'createFreezeBitcoreScript').and.returnValue(mockRedeemScript);

      const actual = bitcoinClient['createBitcoreUnspentOutputFromFrozenTransaction'](mockFreezeTxn, mockFreezeUntilBlock);
      expect(actual.txId).toEqual(mockFreezeTxn.id);
      expect(actual.outputIndex).toEqual(0);
      expect(actual.script.toASM()).toEqual(mockRedeemScriptHash.toASM());
      expect(actual.satoshis).toEqual(mockFreezeTxn.outputs[0].satoshis);
      expect(createScriptSpy).toHaveBeenCalledWith(mockFreezeUntilBlock);
    });
  });

  describe('createFreezeBitcoreScript', () => {
    it('should create the correct redeem script', async () => {
      const mockLockUntilBlock = 45000;
      const mockLockUntilBuffer = Buffer.alloc(3);
      mockLockUntilBuffer.writeIntLE(mockLockUntilBlock, 0, 3);

      const publicKeyHashOutScript = Script.buildPublicKeyHashOut(privateKeyAddressFromBitcoinClient);

      const mockLockUntilBufferAsHex = mockLockUntilBuffer.toString('hex');
      const expectedScriptAsm = `${mockLockUntilBufferAsHex} OP_NOP2 OP_DROP ${publicKeyHashOutScript.toASM()}`;

      const redeemScript = bitcoinClient['createFreezeBitcoreScript'](mockLockUntilBlock);
      expect(redeemScript.toASM()).toEqual(expectedScriptAsm);
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

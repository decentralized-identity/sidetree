import BitcoinClient from '../../lib/bitcoin/BitcoinClient';
import BitcoinInputModel from '../../lib/bitcoin/models/BitcoinInputModel';
import BitcoinOutputModel from '../../lib/bitcoin/models/BitcoinOutputModel';
import BitcoinTransactionModel from '../../lib/bitcoin/models/BitcoinTransactionModel';
import { FetchError } from 'node-fetch';
import SidetreeTransactionParser from '../../lib/bitcoin/SidetreeTransactionParser';

describe('SidetreeTransactionParser', () => {
  let sidetreeTransactionPrefix: string;

  beforeAll(() => {
    sidetreeTransactionPrefix = 'sidetree:';
  });

  const validTestWalletImportString = 'cTpKFwqu2HqW4y5ByMkNRKAvkPxEcwpax5Qr33ibYvkp1KSxdji6';
  const bitcoinClient = new BitcoinClient('uri:test', 'u', 'p', validTestWalletImportString, 10, 1, 0);

  let sidetreeTxnParser: SidetreeTransactionParser;

  beforeEach(() => {
    sidetreeTxnParser = new SidetreeTransactionParser(bitcoinClient, sidetreeTransactionPrefix);
  });

  function createValidDataOutput (data: string): BitcoinOutputModel {
    const sidetreeDataWithPrefix = sidetreeTransactionPrefix + data;
    const sidetreeDataWithPrefixInHex = Buffer.from(sidetreeDataWithPrefix).toString('hex');

    return {
      satoshis: 0,
      scriptAsmAsString: `OP_RETURN ${sidetreeDataWithPrefixInHex}`
    };
  }

  describe('parse', () => {
    it('should return undefined if the sidetree data is invalid', async (done) => {
      const mockTxn: BitcoinTransactionModel = {
        id: 'some id',
        blockHash: 'hash',
        confirmations: 1,
        outputs: [],
        inputs: []
      };

      spyOn(sidetreeTxnParser as any, 'getValidSidetreeDataFromOutputs').and.returnValue(undefined);

      const actual = await sidetreeTxnParser.parse(mockTxn);
      expect(actual).not.toBeDefined();
      done();
    });

    it('should return undefined if the writer data is invalid', async (done) => {
      const mockTxn: BitcoinTransactionModel = {
        id: 'some id',
        blockHash: 'hash',
        confirmations: 1,
        outputs: [],
        inputs: []
      };

      spyOn(sidetreeTxnParser as any, 'getValidSidetreeDataFromOutputs').and.returnValue('some data');
      spyOn(sidetreeTxnParser as any, 'getValidWriterFromInputs').and.returnValue(undefined);

      const actual = await sidetreeTxnParser.parse(mockTxn);
      expect(actual).not.toBeDefined();
      done();
    });

    it('should return correct expected data', async (done) => {
      const sidetreeData = 'sidetree data';
      const writer = 'valid writer';

      const mockTxn: BitcoinTransactionModel = {
        id: 'some id',
        blockHash: 'hash',
        confirmations: 1,
        outputs: [],
        inputs: []
      };

      spyOn(sidetreeTxnParser as any, 'getValidSidetreeDataFromOutputs').and.returnValue(sidetreeData);
      spyOn(sidetreeTxnParser as any, 'getValidWriterFromInputs').and.returnValue(writer);

      const actual = await sidetreeTxnParser.parse(mockTxn);
      expect(actual).toBeDefined();
      expect(actual!.data).toEqual(sidetreeData);
      expect(actual!.writer).toEqual(writer);
      done();
    });
  });

  describe('getValidSidetreeDataFromOutputs', () => {
    it('should return the sidetree data if only one output has the data present', async (done) => {
      const mockSidetreeData = 'some side tree data';
      let sidetreeDataSent = false;
      spyOn(sidetreeTxnParser as any, 'getSidetreeDataFromOutputIfExist').and.callFake(() => {
        if (!sidetreeDataSent) {
          sidetreeDataSent = true;
          return mockSidetreeData;
        }

        return undefined;
      });

      const mockOutputs: BitcoinOutputModel[] = [
        createValidDataOutput('mock data 1'),
        createValidDataOutput('mock data 2')
      ];

      const actual = sidetreeTxnParser['getValidSidetreeDataFromOutputs'](mockOutputs, sidetreeTransactionPrefix);
      expect(actual).toEqual(mockSidetreeData);
      done();
    });

    it('should return undefined if no output has any sidetree data.', async (done) => {
      spyOn(sidetreeTxnParser as any, 'getSidetreeDataFromOutputIfExist').and.returnValue(undefined);

      const mockOutputs: BitcoinOutputModel[] = [
        createValidDataOutput('mock data 1'),
        createValidDataOutput('mock data 2')
      ];

      const actual = sidetreeTxnParser['getValidSidetreeDataFromOutputs'](mockOutputs, sidetreeTransactionPrefix);
      expect(actual).not.toBeDefined();
      done();
    });

    it('should only return the first output with the sidetree data.', async (done) => {
      const mockOutputs: BitcoinOutputModel[] = [
        createValidDataOutput('mock data 1'),
        createValidDataOutput('mock data 2'),
        createValidDataOutput('mock data 2')
      ];

      let callCount = 0;
      spyOn(sidetreeTxnParser as any, 'getSidetreeDataFromOutputIfExist').and.callFake(() => {
        callCount++;

        if (callCount > 1) {
          return `mockSidetreeData ${callCount}`;
        }

        return undefined;
      });

      const actual = sidetreeTxnParser['getValidSidetreeDataFromOutputs'](mockOutputs, sidetreeTransactionPrefix);
      expect(actual).toEqual('mockSidetreeData 2');
      done();
    });
  });

  describe('getSidetreeDataFromOutputIfExist', async () => {
    it('should return the data if the valid sidetree transaction exist', async (done) => {
      const sidetreeData = 'some test data';
      const mockDataOutput = createValidDataOutput(sidetreeData);

      const actual = sidetreeTxnParser['getSidetreeDataFromOutputIfExist'](mockDataOutput, sidetreeTransactionPrefix);
      expect(actual!).toEqual(sidetreeData);
      done();
    });

    it('should return undefined if no valid sidetree transaction exist', async (done) => {
      const mockOutput: BitcoinOutputModel = { satoshis: 0, scriptAsmAsString: 'some random data' };

      const actual = sidetreeTxnParser['getSidetreeDataFromOutputIfExist'](mockOutput, sidetreeTransactionPrefix);
      expect(actual).not.toBeDefined();
      done();
    });

    it('should return undefined if data does not start with sidetree prefix', async (done) => {
      const sidetreeData = 'some test data';
      const mockDataOutput = createValidDataOutput(sidetreeData);

      const actual = sidetreeTxnParser['getSidetreeDataFromOutputIfExist'](mockDataOutput, 'notSidetree');
      expect(actual).not.toBeDefined();
      done();
    });
  });

  describe('getValidWriterFromInputs', () => {
    it('should return undefined if the number of inputs are less than 1', async (done) => {
      const actual = await sidetreeTxnParser['getValidWriterFromInputs']('txn id', []);
      expect(actual).toBeUndefined();
      done();
    });

    it('should return undefined if the script asm has only 1 values', async (done) => {
      const mockInput: BitcoinInputModel[] = [
        { outputIndexInPreviousTransaction: 0, previousTransactionId: 'id', scriptAsmAsString: 'signature' }
      ];

      const actual = await sidetreeTxnParser['getValidWriterFromInputs']('txn id', mockInput);
      expect(actual).toBeUndefined();
      done();
    });

    it('should return undefined if the script asm has 3 values', async (done) => {
      const mockInput: BitcoinInputModel[] = [
        { outputIndexInPreviousTransaction: 0, previousTransactionId: 'id', scriptAsmAsString: 'signature publickey script' }
      ];

      const actual = await sidetreeTxnParser['getValidWriterFromInputs']('txn id', mockInput);
      expect(actual).toBeUndefined();
      done();
    });

    it('should return undefined if the output being spent is not found.', async (done) => {
      spyOn(sidetreeTxnParser as any, 'fetchOutput').and.returnValue(Promise.resolve(undefined));

      const mockInput: BitcoinInputModel[] = [
        { outputIndexInPreviousTransaction: 0, previousTransactionId: 'id', scriptAsmAsString: 'signature publickey' }
      ];

      const actual = await sidetreeTxnParser['getValidWriterFromInputs']('txn id', mockInput);
      expect(actual).toBeUndefined();
      done();
    });

    it('should return the value returned by the utitlity function.', async (done) => {
      const mockOutput: BitcoinOutputModel = { satoshis: 50, scriptAsmAsString: 'output script' };
      spyOn(sidetreeTxnParser as any, 'fetchOutput').and.returnValue(Promise.resolve(mockOutput));

      const mockInput: BitcoinInputModel[] = [
        { outputIndexInPreviousTransaction: 0, previousTransactionId: 'id', scriptAsmAsString: 'signature publickey' }
      ];

      const mockPublicKeyHash = 'public-key-hash';
      spyOn(sidetreeTxnParser as any, 'getPublicKeyHashIfValidScript').and.returnValue(mockPublicKeyHash);

      const actual = await sidetreeTxnParser['getValidWriterFromInputs']('txn id', mockInput);
      expect(actual).toEqual(mockPublicKeyHash);
      done();
    });

  });

  describe('fetchOutput', () => {
    it('should return the otuput returned by calling the bitcoin client', async (done) => {
      const mockTxn: BitcoinTransactionModel = {
        id: 'id',
        blockHash: 'block-hash',
        confirmations: 5,
        inputs: [],
        outputs: [
          { satoshis: 50, scriptAsmAsString: 'script asm 1' },
          { satoshis: 10, scriptAsmAsString: 'script asm 2' }
        ]
      };

      spyOn(sidetreeTxnParser['bitcoinClient'], 'getRawTransaction').and.returnValue(Promise.resolve(mockTxn));

      const actual = await sidetreeTxnParser['fetchOutput']('txn id', 1);
      expect(actual).toEqual(mockTxn.outputs[1]);
      done();
    });

    it('should throw if fetch throws', async () => {
      const mockError = new FetchError('mocked test error', 'request-timeout');
      spyOn(sidetreeTxnParser['bitcoinClient'], 'getRawTransaction').and.callFake(async () => {
        throw mockError;
      });

      try {
        await sidetreeTxnParser['fetchOutput']('txn id', 1);
        fail();
      } catch (e) {
        expect(e).toEqual(mockError);
      }
    });
  });

  describe('getPublicKeyHashIfValidScript', () => {
    it('should return the correct value if the script is in the correct format.', () => {
      const publickey = 'valid-public-key';
      const validInput = `OP_DUP OP_HASH160 ${publickey} OP_EQUALVERIFY OP_CHECKSIG`;

      const actual = sidetreeTxnParser['getPublicKeyHashIfValidScript'](validInput);
      expect(actual).toEqual(publickey);
    });

    it('should return undefined if the input is not in correct format.', () => {
      const actual = sidetreeTxnParser['getPublicKeyHashIfValidScript']('some invalid input');
      expect(actual).toBeUndefined();
    });
  });
});

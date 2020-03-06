import BitcoinOutputModel from '../../lib/bitcoin/models/BitcoinOutputModel';
import SidetreeTransactionData from '../../lib/bitcoin/SidetreeTransactionData';
import BitcoinTransactionModel from '../../lib/bitcoin/models/BitcoinTransactionModel';

describe('SidetreeTransactionData', () => {
  let sidetreeTransactionPrefix: string;

  beforeAll(() => {
    sidetreeTransactionPrefix = 'sidetree:';
  });

  function createValidDataOutput (data: string): BitcoinOutputModel {
    const sidetreeDataWithPrefix = sidetreeTransactionPrefix + data;
    const sidetreeDataWithPrefixInHex = Buffer.from(sidetreeDataWithPrefix).toString('hex');

    return {
      satoshis: 0,
      scriptAsmAsString: `OP_RETURN ${sidetreeDataWithPrefixInHex}`
    };
  }

  function createValidWriterOutput (writer: string, satoshis: number = 10): BitcoinOutputModel {
    return {
      satoshis: satoshis,
      scriptAsmAsString: `OP_DUP OP_HASH160 ${writer} OP_EQUALVERIFY OP_CHECKSIG`
    };
  }

  describe('parse', () => {
    it('should return undefined if the output length is not 2', async (done) => {
      const mockTxn: BitcoinTransactionModel = {
        id: 'some id',
        blockHash: 'hash',
        confirmations: 1,
        outputs: [],
        inputs: []
      };

      const actual = SidetreeTransactionData.parse(mockTxn, sidetreeTransactionPrefix);
      expect(actual).not.toBeDefined();
      done();
    });

    it('should return undefined if the sidetree data is invalid', async (done) => {
      const mockTxn: BitcoinTransactionModel = {
        id: 'some id',
        blockHash: 'hash',
        confirmations: 1,
        outputs: [
          { satoshis: 0, scriptAsmAsString: 'some input' },
          createValidWriterOutput('some writer')
        ],
        inputs: []
      };

      spyOn(SidetreeTransactionData as any, 'getSidetreeDataFromVOutIfExist').and.returnValue(undefined);

      const actual = SidetreeTransactionData.parse(mockTxn, sidetreeTransactionPrefix);
      expect(actual).not.toBeDefined();
      done();
    });

    it('should return undefined if the writer data is invalid', async (done) => {
      const mockTxn: BitcoinTransactionModel = {
        id: 'some id',
        blockHash: 'hash',
        confirmations: 1,
        outputs: [
          createValidDataOutput('data'),
          { satoshis: 0, scriptAsmAsString: 'invalid writer script' }
        ],
        inputs: []
      };

      spyOn(SidetreeTransactionData as any, 'getSidetreeDataFromVOutIfExist').and.returnValue('some data');
      spyOn(SidetreeTransactionData as any, 'getWriterFromVOutIfExist').and.returnValue(undefined);

      const actual = SidetreeTransactionData.parse(mockTxn, sidetreeTransactionPrefix);
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
        outputs: [
          createValidDataOutput(sidetreeData),
          createValidWriterOutput(writer)
        ],
        inputs: []
      };

      spyOn(SidetreeTransactionData as any, 'getSidetreeDataFromVOutIfExist').and.returnValue(sidetreeData);
      spyOn(SidetreeTransactionData as any, 'getWriterFromVOutIfExist').and.returnValue(writer);

      const actual = SidetreeTransactionData.parse(mockTxn, sidetreeTransactionPrefix);
      expect(actual).toBeDefined();
      expect(actual!.data).toEqual(sidetreeData);
      expect(actual!.writer).toEqual(writer);
      done();
    });
  });

  describe('getSidetreeDataFromVOutIfExist', async () => {
    it('should return the data if the valid sidetree transaction exist', async (done) => {
      const sidetreeData = 'some test data';
      const mockDataOutput = createValidDataOutput(sidetreeData);

      const actual = SidetreeTransactionData['getSidetreeDataFromVOutIfExist'](mockDataOutput, sidetreeTransactionPrefix);
      expect(actual!).toEqual(sidetreeData);
      done();
    });

    it('should return undefined if no valid sidetree transaction exist', async (done) => {
      const mockOutput: BitcoinOutputModel = { satoshis:  0, scriptAsmAsString: 'some random data' };

      const actual = SidetreeTransactionData['getSidetreeDataFromVOutIfExist'](mockOutput, sidetreeTransactionPrefix);
      expect(actual).not.toBeDefined();
      done();
    });
  });

  describe('getWriterFromVOutIfExist', async () => {
    it('should return the data if the valid sidetree transaction exist', async (done) => {
      const sidetreeWriter = 'somewriter';
      const mockWriterOutput = createValidWriterOutput(sidetreeWriter);

      const actual = SidetreeTransactionData['getWriterFromVOutIfExist'](mockWriterOutput);
      expect(actual!).toEqual(sidetreeWriter);
      done();
    });

    it('should return undefined if no valid sidetree transaction exist', async (done) => {
      const sidetreeWriter = 'some writer';
      const mockWriterOutput = createValidWriterOutput(sidetreeWriter);
      mockWriterOutput.scriptAsmAsString += ' OP_DUP';

      const actual = SidetreeTransactionData['getWriterFromVOutIfExist'](mockWriterOutput);
      expect(actual).not.toBeDefined();
      done();
    });
  });

  it('should return undefined if script asm is undefined', async (done) => {
    const mockWriterOutput: BitcoinOutputModel = {
      satoshis: 0, scriptAsmAsString: (undefined as any) as string
    };

    const actual = SidetreeTransactionData['getWriterFromVOutIfExist'](mockWriterOutput);
    expect(actual).not.toBeDefined();
    done();
  });
});

import BitcoinRawDataParser from '../../lib/bitcoin/BitcoinRawDataParser';
import ErrorCode from '../../lib/bitcoin/ErrorCode';
import SidetreeError from '../../lib/common/SidetreeError';
import * as fs from 'fs';

describe('BitcoinRawDataParser', () => {
  describe('parseRawDataFile', () => {
    it('should parse block files', () => {
      const hex = fs.readFileSync('tests/bitcoin/testData/bitcoinTwoBlocksRawDataHex.txt', 'utf8');
      const blockDataFileBuffer = Buffer.from(hex, 'hex');
      const result = BitcoinRawDataParser.parseRawDataFile(blockDataFileBuffer);
      expect(result).toBeDefined();
      const keys = Object.keys(result);
      expect(keys.length).toEqual(2);
      for (const key of keys) {
        expect(key).toEqual(result[key].hash);
      }
    });

    it('should handle skip magic bytes', () => {
      const blockDataFileBuffer = Buffer.from('0000000000000000', 'hex');
      const result = BitcoinRawDataParser.parseRawDataFile(blockDataFileBuffer);
      expect(result).toEqual({});
    });

    it('should handle invalid magic bytes', () => {
      const blockDataFileBuffer = Buffer.from('ffffffffffffffff', 'hex');
      expect(() => {
        BitcoinRawDataParser.parseRawDataFile(blockDataFileBuffer);
      }).toThrow(new SidetreeError(ErrorCode.BitcoinRawDataParserInvalidMagicBytes,
        'ffffffff at cursor position 0 is not valid bitcoin testnet or mainnet magic bytes'));
    });

    it('should handle invalid raw block files', () => {
      const blockDataFileBuffer = Buffer.from('0b11090700000001ff', 'hex');
      expect(() => {
        BitcoinRawDataParser.parseRawDataFile(blockDataFileBuffer);
      }).toThrow(new SidetreeError(ErrorCode.BitcoinRawDataParserInvalidBlockData, 'Attempt to access memory outside buffer bounds'));
    });
  });
});

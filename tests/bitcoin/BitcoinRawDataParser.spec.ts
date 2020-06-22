import BitcoinRawDataParser from '../../lib/bitcoin/BitcoinRawDataParser';
import * as fs from 'fs';

describe('BitcoinRawDataParser', () => {
  describe('parseRawDataFile', () => {
    it('should parse block fils', () => {
      const hex = fs.readFileSync('tests/bitcoin/testData/bitcoinThreeBlocksRawDataHex.txt', 'utf8');
      const blockDataFileBuffer = Buffer.from(hex, 'hex');
      const result = BitcoinRawDataParser.parseRawDataFile(blockDataFileBuffer);
      expect(result).toBeDefined();
      const keys = Object.keys(result);
      expect(keys.length).toEqual(3);
      for (const key of keys) {
        expect(key).toEqual(result[key].hash);
      }
    });

    it('should handle invalid magic bytes', () => {
      const blockDataFileBuffer = Buffer.from('ffffffffffffffff', 'hex');
      expect(() => {
        BitcoinRawDataParser.parseRawDataFile(blockDataFileBuffer);
      }).toThrow(new Error('Invalid block data'));
    });

    it('should handle invalid raw block files', () => {
      const blockDataFileBuffer = Buffer.from('0b110907ffffffff', 'hex');
      expect(() => {
        BitcoinRawDataParser.parseRawDataFile(blockDataFileBuffer);
      }).toThrow(new Error('Incomplete block data'));
    });
  });

  describe('verifySize', () => {
    it('should return false if size mismatch', () => {
      // size expected to be 3 but is 2
      const result = BitcoinRawDataParser['verifySize']('03000000abab');
      expect(result).toEqual(false);
    });

    it('should return true if size matches', () => {
      const result = BitcoinRawDataParser['verifySize']('02000000abab');
      expect(result).toEqual(true);
    });
  });
});

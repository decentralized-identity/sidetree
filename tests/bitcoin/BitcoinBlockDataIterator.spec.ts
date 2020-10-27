import * as fs from 'fs';
import BitcoinBlockDataIterator from '../../lib/bitcoin/BitcoinBlockDataIterator';
import BitcoinRawDataParser from '../../lib/bitcoin/BitcoinRawDataParser';

describe('bitcoinBlockDataIterator', () => {
  let bitcoinBlockDataIterator: BitcoinBlockDataIterator;
  beforeAll(() => {
    spyOn(fs, 'readdirSync').and.returnValue(['blk01.dat' as any]);
    bitcoinBlockDataIterator = new BitcoinBlockDataIterator('/');
  });

  describe('hasPrevious', () => {
    it('should return true if has previous', () => {
      bitcoinBlockDataIterator['currentIndex'] = 100;
      const result = bitcoinBlockDataIterator.hasPrevious();
      expect(result).toBeTruthy();
    });

    it('should return false if does not have previous', () => {
      bitcoinBlockDataIterator['currentIndex'] = -1;
      const result = bitcoinBlockDataIterator.hasPrevious();
      expect(result).toBeFalsy();
    });
  });

  describe('previous', () => {
    it('should return undefined if no previous', () => {
      bitcoinBlockDataIterator['currentIndex'] = -1;
      const result = bitcoinBlockDataIterator.previous();
      expect(result).toBeUndefined();
    });

    it('should return expected results if has previous', () => {
      bitcoinBlockDataIterator['currentIndex'] = 1;
      bitcoinBlockDataIterator['fileNames'] = ['some', 'files'];
      const fileReaderSpy = spyOn(bitcoinBlockDataIterator['fileReader'], 'readBlockFile');
      const bitcoinRawDataParserSpy = spyOn(BitcoinRawDataParser, 'parseRawDataFile').and.returnValue([]);
      const result = bitcoinBlockDataIterator.previous();

      expect(bitcoinBlockDataIterator['currentIndex']).toEqual(0);
      expect(result).toEqual([]);
      expect(fileReaderSpy).toHaveBeenCalledTimes(1);
      expect(bitcoinRawDataParserSpy).toHaveBeenCalledTimes(1);
    });
  });
});

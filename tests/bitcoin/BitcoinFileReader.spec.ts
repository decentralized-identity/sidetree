import * as fs from 'fs';
import BitcoinFileReader from '../../lib/bitcoin/BitcoinFileReader';
import ErrorCode from '../../lib/bitcoin/ErrorCode';
import SidetreeError from '../../lib/common/SidetreeError';

describe('BitcoinFileReader', () => {
  let bitcoinFileReader: BitcoinFileReader;
  const testDir = 'test/dir';
  beforeAll(() => {
    bitcoinFileReader = new BitcoinFileReader(testDir);
  });

  describe('listBlockFiles', () => {
    it('should list block files', () => {
      spyOn(fs, 'readdirSync' as any).and.callFake((path: fs.PathLike) => {
        expect(path).toEqual(`${testDir}/blocks`);
        return ['blk001.dat', 'notBlk.dat', 'test.ts', 'blk002.dat'];
      });

      const result = bitcoinFileReader.listBlockFiles();
      expect(result).toEqual(['blk001.dat', 'blk002.dat']);
    });

    it('should return empty array if fs throws', () => {
      spyOn(fs, 'readdirSync' as any).and.throwError('Fake fs error in test');

      expect(() => {
        bitcoinFileReader.listBlockFiles();
      }).toThrow(new SidetreeError(ErrorCode.BitcoinFileReaderBlockCannotReadDirectory, 'Fake fs error in test'));
    });
  });

  describe('readBlockFile', () => {
    it('should return the expected buffer', () => {
      const fileName = 'blk000.dat';
      spyOn(fs, 'readFileSync' as any).and.callFake((path: fs.PathLike) => {
        expect(path).toEqual(`${testDir}/blocks/${fileName}`);
        return Buffer.from('some string');
      });

      const result = bitcoinFileReader.readBlockFile(fileName);
      expect(result).toEqual(Buffer.from('some string'));
    });

    it('should return undefined if fs throws', () => {
      spyOn(fs, 'readFileSync' as any).and.throwError('Fake fs error in test');
      expect(() => {
        bitcoinFileReader.readBlockFile('fileName');
      }).toThrow(new SidetreeError(ErrorCode.BitcoinFileReaderBlockCannotReadFile, 'Fake fs error in test'));
    });
  });

});

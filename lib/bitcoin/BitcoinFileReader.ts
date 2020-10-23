import * as fs from 'fs';
import ErrorCode from './ErrorCode';
import IBitcoinFileReader from './interfaces/IBitcoinFileReader';
import SidetreeError from '../common/SidetreeError';

/**
 * concrete implementation of BitcoinFileReader
 */
export default class BitcoinFileReader implements IBitcoinFileReader {
  /**
   * Constructor
   * @param bitcoinDataDirectory The same directory used by bitcoin core
   */
  public constructor (private bitcoinDataDirectory: string) {}

  public listBlockFiles (): string[] {
    const blocksDataDirectoryPath = `${this.bitcoinDataDirectory}/blocks`;
    let blockDataDir;
    try {
      blockDataDir = fs.readdirSync(blocksDataDirectoryPath);
    } catch (e) {
      throw SidetreeError.createFromError(ErrorCode.BitcoinFileReaderBlockCannotReadDirectory, e);
    }
    const blockFileList = blockDataDir.filter((fileName) => { return fileName.startsWith('blk'); });
    return blockFileList;
  }

  public readBlockFile (fileName: string): Buffer {
    try {
      return fs.readFileSync(`${this.bitcoinDataDirectory}/blocks/${fileName}`);
    } catch (e) {
      throw SidetreeError.createFromError(ErrorCode.BitcoinFileReaderBlockCannotReadFile, e);
    }
  }
}

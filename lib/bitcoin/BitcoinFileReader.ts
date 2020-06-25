import ErrorCode from './ErrorCode';
import IBitcoinFileReader from './interfaces/IBitcoinFileReader';
import SidetreeError from '../common/SidetreeError';
import * as fs from 'fs';

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
      // this means directory does not exist
      console.error(`Error thrown while reading file system: ${e}`);
      throw new SidetreeError(ErrorCode.BitcoinFileReaderBlockDirectoryDoesNotExist);
    }
    const blockFileList = blockDataDir.filter((fileName) => { return fileName.startsWith('blk'); });
    return blockFileList;
  }

  public readBlockFile (fileName: string): Buffer {
    try {
      return fs.readFileSync(`${this.bitcoinDataDirectory}/blocks/${fileName}`);
    } catch (e) {
      // this means file does not exist
      console.error(`Error thrown while reading file system: ${e}`);
      throw new SidetreeError(ErrorCode.BitcoinFileReaderBlockFileDoesNotExist);
    }
  }
}

import IBitcoinFileReader from './interfaces/IBitcoinFileReader';
import * as fs from 'fs';

/**
 * concrete implementation of BitcoinFileReader
 */
export default class BitcoinFileReader implements IBitcoinFileReader {
  /**
   * Constructor
   * @param bitcoinDataDirectory The same directory used by bitcoind
   */
  public constructor (public bitcoinDataDirectory: string) {}

  public listBlockFiles (): string[] {
    const blocksDataDirectoryPath = `${this.bitcoinDataDirectory}/blocks`;
    let blockDataDir;
    try {
      blockDataDir = fs.readdirSync(blocksDataDirectoryPath);
    } catch (e) {
      console.error(`Error thrown while reading file system: ${e}`);
      return [];
    }
    const blockFileList = blockDataDir.filter((fileName) => { return fileName.startsWith('blk'); });
    return blockFileList;
  }

  public readBlockFile (fileName: string): Buffer | undefined {
    try {
      return fs.readFileSync(`${this.bitcoinDataDirectory}/blocks/${fileName}`);
    } catch (e) {
      console.error(`Error thrown while reading file system: ${e}`);
      return undefined;
    }
  }
}

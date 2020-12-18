import BitcoinBlockModel from './models/BitcoinBlockModel';
import BitcoinFileReader from './BitcoinFileReader';
import BitcoinRawDataParser from './BitcoinRawDataParser';
import Logger from '../common/Logger';

/**
 * Iterates through block data by parsing raw block data file from latest file to earliest
 */
export default class BitcoinBlockDataIterator {
  private fileReader: BitcoinFileReader;
  private fileNames: string[];
  private currentIndex: number;
  constructor (path: string) {
    this.fileReader = new BitcoinFileReader(path);
    this.fileNames = this.fileReader.listBlockFiles().sort();
    this.currentIndex = this.fileNames.length - 1;
  }

  /**
   * Returns if there is another file to read
   */
  public hasPrevious (): boolean {
    return this.currentIndex >= 0;
  }

  /**
   * Returns the previous block data or undefined if there is no previous.
   */
  public previous (): BitcoinBlockModel[] | undefined {
    if (!this.hasPrevious()) {
      return undefined;
    }
    Logger.info(`Parsing file: ${this.fileNames[this.currentIndex]}`);
    const fileBuffer = this.fileReader.readBlockFile(this.fileNames[this.currentIndex]);
    const parsedData = BitcoinRawDataParser.parseRawDataFile(fileBuffer);
    this.currentIndex--;
    return parsedData;
  }
}

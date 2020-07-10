import BitcoinFileReader from './BitcoinFileReader';
import BitcoinBlockModel from './models/BitcoinBlockModel';
import BitcoinRawDataParser from './BitcoinRawDataParser';

/**
 * Iterates through block data by parsing raw block data file from latest file to oldest
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
   * Returns the next block data or undefined if there is no next
   */
  public previous (): {[blockHash: string]: BitcoinBlockModel} | undefined {
    if (this.currentIndex < 0) {
      return undefined;
    }
    console.log(`Parsing file: ${this.fileNames[this.currentIndex]}`);
    const fileBuffer = this.fileReader.readBlockFile(this.fileNames[this.currentIndex]);
    const parsedData = BitcoinRawDataParser.parseRawDataFile(fileBuffer);
    this.currentIndex--;
    return parsedData;
  }
}

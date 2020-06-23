import { Block } from 'bitcore-lib';

/**
 * Parser for raw bitcoin block data
 */
export default class BitcoinRawDataParser {

  /**
   * The beginning of each block contains the magic bytes indicating main or test net
   * followed by a 4 byte number indicating how big the block data is
   */
  private static magicBytes = {
    testnet: '0b110907',
    mainnet: 'f9beb4d9'
  };
  private static sizeBytesLength = 4;

  /**
   * Parse the given raw block data file. It can throw error if block data is invalid when validating magic bytes,
   * creating new Block, or validating size
   * @param rawBlockDataFileBuffer The file, in buffer form, to be parsed as blocks
   */
  public static parseRawDataFile (rawBlockDataFileBuffer: Buffer): any {
    let rawBlockDataFileString = rawBlockDataFileBuffer.toString('hex');
    let hexStrings: string[];
    let magicBytes: string;
    const blockMapper: any = {};

    // split the hex by magic bytes
    if (rawBlockDataFileString.startsWith(BitcoinRawDataParser.magicBytes.testnet)) {
      magicBytes = BitcoinRawDataParser.magicBytes.testnet;
      hexStrings = rawBlockDataFileString.split(magicBytes);
    } else if (rawBlockDataFileString.startsWith(BitcoinRawDataParser.magicBytes.mainnet)) {
      magicBytes = BitcoinRawDataParser.magicBytes.mainnet;
      hexStrings = rawBlockDataFileString.split(magicBytes);
    } else {
      throw new Error('Invalid block data');
    }

    // remove the first empty string after split
    hexStrings.shift();

    let currentHex = '';
    let count = 0;
    for (const hexString of hexStrings) {
      if (currentHex === '') {
        currentHex = hexString;
      } else {
        // take care of when non magic bytes get split. Add back the bytes and concat
        currentHex = `${currentHex}${magicBytes}${hexString}`;
      }
      if (BitcoinRawDataParser.verifySize(currentHex)) {
        // A hex string can be treated as raw block data once size is verified and size bytes removed
        const rawBlockDataAsString = currentHex.slice(BitcoinRawDataParser.sizeBytesLength * 2);
        const rawBlockDataAsBuffer = Buffer.from(rawBlockDataAsString, 'hex');
        // this can throw if the data is malformed
        const block = new Block(rawBlockDataAsBuffer);
        blockMapper[block.hash] = block;
        currentHex = '';
        count++;
      }
    }

    if (currentHex.length > 0) {
      throw new Error('Incomplete block data');
    }

    console.info(`Finished processing ${count} blocks from raw block file`);
    return blockMapper;
  }

  /**
   * Verify the size of a given block hex string
   * @returns True if denoted size matches real size, false otherwise.
   */
  private static verifySize (hex: string) {
    // first 4 bytes of a raw block data denote size in little endian, 2 characters is a byte
    const sizeLittleEndian = hex.substring(0, BitcoinRawDataParser.sizeBytesLength * 2);
    const sizeBigEndian = sizeLittleEndian.match(/../g)!.reverse().join('');

    // parse the hex value as base 16. Plus 4 to take the size itself into account
    const size = (parseInt(sizeBigEndian, 16) + BitcoinRawDataParser.sizeBytesLength) * 2;
    return hex.length === size;
  }
}

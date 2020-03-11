import * as crypto from 'crypto';

/**
 * decodes blk.dat files
 */
export default class BlockDataFileDecoder {

  /**
   * these magic bytes denote the beginning of a message in their respective environment
   */
  public static magicBytes = {
    testnet: '0b110907',
    mainnet: 'f9beb4d9',
    regtest: 'fabfb5da'
  };

  /**
   * decode a blk.dat file
   */
  public static decode (blockDataBuffer: Buffer): any {
    // decode the buffer as hex
    let hexValue = blockDataBuffer.toString('hex');

    // an array of hex string, each one representing a block
    let blocksHex: string[];

    if (hexValue.startsWith(BlockDataFileDecoder.magicBytes.testnet)) {
      blocksHex = hexValue.split(BlockDataFileDecoder.magicBytes.testnet);
    } else if (hexValue.startsWith(BlockDataFileDecoder.magicBytes.mainnet)) {
      blocksHex = hexValue.split(BlockDataFileDecoder.magicBytes.mainnet);
    } else if (hexValue.startsWith(BlockDataFileDecoder.magicBytes.regtest)) {
      blocksHex = hexValue.split(BlockDataFileDecoder.magicBytes.regtest);
    } else {
      console.log('Given buffer is not a valid blk.dat file');
      return;
    }

    // shift one because the first elem after split is empty
    blocksHex.shift();

    const parsedBlocks = [];

    for (let blockHex of blocksHex) {
      let size: number;
      [size, blockHex] = BlockDataFileDecoder.getSize(blockHex);

      let blockHeader: string;
      [blockHeader, blockHex] = BlockDataFileDecoder.getHeader(blockHex);
      const blockHash = BlockDataFileDecoder.getBlockHashFromHeader(blockHeader);

      let numOfTransactions: number;
      [numOfTransactions, blockHex] = BlockDataFileDecoder.getNumOfTransactions(blockHex);

      // right now, the remainder are transaction data
      // TODO add transaction data parsing

      parsedBlocks.push({
        size: size,
        blockHash: blockHash,
        numberOfTransactions: numOfTransactions,
        transactionData: blockHex
      });
    }

    return parsedBlocks;
  }

  /**
   * returns the size in number and the new hex string with size stripped out of it
   * @param hex the hex value to extract size from
   */
  private static getSize (hex: string): [number, string] {
    // 4 bytes denote size in little endian
    const sizeLittleEndian = BlockDataFileDecoder.getNextNBytesInAHexString(hex, 4);
    const sizeBigEndian = BlockDataFileDecoder.littleToBigEndian(sizeLittleEndian);
    // parse the hex value as base 16
    const size = parseInt(sizeBigEndian, 16);

    const strippedHex = BlockDataFileDecoder.removeFirstNBytesFromHexString(hex, 4);
    return [size, strippedHex];
  }

  private static getHeader (hex: string): [string, string] {
    // 80 bytes denote the block header
    const header = BlockDataFileDecoder.getNextNBytesInAHexString(hex, 80);
    const strippedHex = BlockDataFileDecoder.removeFirstNBytesFromHexString(hex, 80);
    return [header, strippedHex];
  }

  /**
   * Returns the hash of a block, which is the header of the block in binary, sha256 hashed twice, then swap endian
   * @param header the header of a block in hex
   */
  private static getBlockHashFromHeader (header: string): string {
    // turn string into buffer binary
    const buf = Buffer.from(header, 'hex');
    // sha256 twice
    const sha256Once = crypto.createHash('sha256').update(buf).digest();
    const sha256Twice = crypto.createHash('sha256').update(sha256Once).digest();
    const blockHashStringInLittleEndian = sha256Twice.toString('hex');
    // swap endian
    const blockHash = BlockDataFileDecoder.littleToBigEndian(blockHashStringInLittleEndian);

    return blockHash;
  }

  private static getNumOfTransactions (hex: string): [number, string] {
    return BlockDataFileDecoder.parseVarInt(hex);
  }

  /**
   * Returns the value of the varInt in base 10 and strip it from the input hex
   * @param hex the hex to parse the varInt from
   */
  private static parseVarInt (hex: string): [number, string] {
    const varIntPrefixMap = new Map();
    varIntPrefixMap.set('fd', 2);
    varIntPrefixMap.set('fe', 4);
    varIntPrefixMap.set('ff', 8);

    // 1 byte denotes the varInt
    const varInt = BlockDataFileDecoder.getNextNBytesInAHexString(hex, 1);
    let strippedHex = BlockDataFileDecoder.removeFirstNBytesFromHexString(hex, 1);
    let value: number;
    if (!varIntPrefixMap.has(varInt)) {
      // this means we take the hex as is
      value = parseInt(varInt, 16);
    } else {
      const bytesToRead = varIntPrefixMap.get(varInt);
      // this means the next 2, 4 or 8 bytes are varInt in little endian depending on the prefix
      const varIntValueHexLittleEndian = BlockDataFileDecoder.getNextNBytesInAHexString(hex, bytesToRead);
      const varIntValueHexBigEndian = BlockDataFileDecoder.littleToBigEndian(varIntValueHexLittleEndian);
      value = parseInt(varIntValueHexBigEndian, 16);
      strippedHex = BlockDataFileDecoder.removeFirstNBytesFromHexString(strippedHex, bytesToRead);
    }

    return [value, strippedHex];
  }

  private static getNextNBytesInAHexString (hex: string, n: number) {
    // 2 characters is a byte
    return hex.substring(0, n * 2);
  }

  private static removeFirstNBytesFromHexString (hex: string, n: number) {
    // 2 characters is a byte
    return hex.substring(n * 2);
  }

  private static littleToBigEndian (hex: string): string {
    // group by every 2 characters (1 byte), reverse the order then join back as a string
    return hex.match(/../g)!.reverse().join('');
  }
}

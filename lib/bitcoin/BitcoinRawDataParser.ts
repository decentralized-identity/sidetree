import BitcoinClient from './BitcoinClient';
import ErrorCode from './ErrorCode';
import SidetreeError from '../common/SidetreeError';
import { Block } from 'bitcore-lib';
import BitcoinBlockModel from './models/BitcoinBlockModel';

/**
 * Parser for raw bitcoin block data
 */
export default class BitcoinRawDataParser {

  /**
   * The beginning of each block contains the magic bytes indicating main or test net
   * followed by a 4 byte number indicating how big the block data is
   */
  private static magicBytes = {
    testnet: Buffer.from('0b110907', 'hex'),
    mainnet: Buffer.from('f9beb4d9', 'hex'),
    skip: Buffer.from('00000000', 'hex') // this means to skip the rest of the file
  };
  private static magicBytesLength = 4;
  private static sizeBytesLength = 4;

  /**
   * Parse the given raw block data file. It can throw error if block data is invalid when validating magic bytes,
   * creating new Block, or validating size
   * @param rawBlockDataFileBuffer The file, in buffer form, to be parsed as blocks
   */
  public static parseRawDataFile (rawBlockDataFileBuffer: Buffer): {[name: string]: BitcoinBlockModel} {
    // Expect raw block data to be in the format of
    // <MagicBytes 4 bytes><SizeBytes 4 bytes><BlockData n bytes><MagicBytes><SizeBytes><BlockData>...repeating
    const blockMapper: {[name: string]: BitcoinBlockModel} = {};
    let count = 0;
    let cursor = 0;

    // loop through each block within the buffer
    while (cursor < rawBlockDataFileBuffer.length) {
      // first 4 bytes are magic bytes
      const actualMagicBytes = rawBlockDataFileBuffer.subarray(cursor, cursor + BitcoinRawDataParser.magicBytesLength);
      if (actualMagicBytes.equals(BitcoinRawDataParser.magicBytes.skip)) {
        break;
      }
      if (!actualMagicBytes.equals(BitcoinRawDataParser.magicBytes.mainnet) && !actualMagicBytes.equals(BitcoinRawDataParser.magicBytes.testnet)) {
        throw new SidetreeError(ErrorCode.BitcoinRawDataParserInvalidMagicBytes);
      }
      cursor += BitcoinRawDataParser.magicBytesLength;

      // next 4 bytes must be a the size bytes in Uint little endian
      // denoting how many bytes worth of block data are after it
      const blockSizeInBytes = rawBlockDataFileBuffer.readUInt32LE(cursor);
      cursor += BitcoinRawDataParser.sizeBytesLength;

      // the next n bytes are the block data
      const blockData = rawBlockDataFileBuffer.subarray(cursor, cursor + blockSizeInBytes);
      let block: Block;
      try {
        block = new Block(blockData);
      } catch (e) {
        console.error(`Bitcore threw error when parsing block data ${e}`);
        throw new SidetreeError(ErrorCode.BitcoinRawDataParserInvalidBlockData);
      }

      // the first transaction, the coinbase, contains the block height in its input
      const coinbaseInputScript = (block.transactions[0].inputs[0] as any)._scriptBuffer;
      // this denotes how many bytes following represent the block height
      const heightBytes = coinbaseInputScript.readUInt8();
      // the next n bytes are the block height in little endian
      const blockHeight = coinbaseInputScript.readUIntLE(1, heightBytes);

      const transactionModels = block.transactions.map((transaction: any) => {
        const bitcoreTransaction = {
          id: transaction.id,
          blockHash: block.hash,
          confirmations: 1, // set to 1 because it has to be confirmed to be on the current longest chain
          inputs: transaction.inputs,
          outputs: transaction.outputs
        };
        return BitcoinClient.createBitcoinTransactionModel(bitcoreTransaction);
      });

      blockMapper[block.hash] = {
        hash: block.hash,
        height: blockHeight,
        previousHash: Buffer.from(block.header.prevHash).reverse().toString('hex'),
        transactions: transactionModels
      };
      cursor += blockSizeInBytes;
      count++;
    }

    console.info(`Finished processing ${count} blocks from raw block file`);
    return blockMapper;
  }
}

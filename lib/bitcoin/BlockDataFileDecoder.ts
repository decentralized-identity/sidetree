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
    mainnet: 'f9beb4d9'
  };

  /**
   * decode a blk.dat file
   */
  public static decode (blockDataBuffer: Buffer): any {
    // structure of blk.dat files: https://learnmeabitcoin.com/guide/blkdat
    // decode the buffer as hex
    let hexValue = blockDataBuffer.toString('hex');

    // an array of hex string, each one representing a block
    let blocksHex: string[];

    if (hexValue.startsWith(BlockDataFileDecoder.magicBytes.testnet)) {
      blocksHex = hexValue.split(BlockDataFileDecoder.magicBytes.testnet);
    } else if (hexValue.startsWith(BlockDataFileDecoder.magicBytes.mainnet)) {
      blocksHex = hexValue.split(BlockDataFileDecoder.magicBytes.mainnet);
    } else {
      console.log('Given buffer is not a valid blk.dat file');
      return [];
    }

    // shift one because the first elem after split is empty
    blocksHex.shift();

    const parsedBlocks = [];

    let count = 1;
    // TODO: make this loop multiprocess
    // We don't need the blocks to be processed sequentially. We can slip the blocks into groups and the multi process
    for (let blockHex of blocksHex) {
      let size: number;
      [size, blockHex] = BlockDataFileDecoder.getSize(blockHex);

      let blockHeader: string;
      [blockHeader, blockHex] = BlockDataFileDecoder.getHeader(blockHex);
      const blockHash = BlockDataFileDecoder.getBlockHashFromHeader(blockHeader);

      let numOfTransactions: number;
      [numOfTransactions, blockHex] = BlockDataFileDecoder.getNumOfTransactions(blockHex);

      let transactionHexes: string[];
      [transactionHexes, blockHex] = BlockDataFileDecoder.getTransactionHexes(blockHex, numOfTransactions);

      console.info(`${count} out of ${blocksHex.length} blocks done`);
      count++;
      parsedBlocks.push({
        size: size,
        blockHash: blockHash,
        numberOfTransactions: numOfTransactions,
        transactionHexes: transactionHexes
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
    const [numberOfTransactions, strippedHex] = BlockDataFileDecoder.parseVarInt(hex);
    return [numberOfTransactions, strippedHex];
  }

  private static getTransactionHexes (hex: string, expectedNumOfTransactions: number): [string[], string] {
    // structure of transaction data: https://learnmeabitcoin.com/guide/transaction-data
    const transactionHexes = [];
    for (let transactionCount = 1; transactionCount <= expectedNumOfTransactions; transactionCount++) {
      // first 4 bytes are transaction version
      let currentTransaction = BlockDataFileDecoder.getNextNBytesInAHexString(hex, 4);
      hex = BlockDataFileDecoder.removeFirstNBytesFromHexString(hex, 4);

      // next bytes are varInt denoting the number of inputs to this transaction
      let varIntHexRepresentationOfInputCount: string;
      let numberOfInputs: number;
      [numberOfInputs, hex, varIntHexRepresentationOfInputCount] = BlockDataFileDecoder.parseVarInt(hex);
      currentTransaction += varIntHexRepresentationOfInputCount;

      // if numberOfInputs is 0, it is bip144 format, it needs to parse the flag and then recount the the the number of inputs
      const isBip144 = numberOfInputs === 0;
      if (isBip144) {
        // parse the 1 byte flag
        currentTransaction += BlockDataFileDecoder.getNextNBytesInAHexString(hex, 1);
        hex = BlockDataFileDecoder.removeFirstNBytesFromHexString(hex, 1);

        // re-calculate the number of inputs
        [numberOfInputs, hex, varIntHexRepresentationOfInputCount] = BlockDataFileDecoder.parseVarInt(hex);
        currentTransaction += varIntHexRepresentationOfInputCount;
      }

      // for each input
      for (let inputCount = 1; inputCount <= numberOfInputs; inputCount++) {
        // first 32 bytes are TXID
        currentTransaction += BlockDataFileDecoder.getNextNBytesInAHexString(hex, 32);
        hex = BlockDataFileDecoder.removeFirstNBytesFromHexString(hex, 32);

        // next 4 bytes are VOUT
        currentTransaction += BlockDataFileDecoder.getNextNBytesInAHexString(hex, 4);
        hex = BlockDataFileDecoder.removeFirstNBytesFromHexString(hex, 4);

        // next few bytes are varInt indicating the size of input script
        let scriptSizeInBytes: number;
        let hexRepresentationOfScriptSize: string;
        [scriptSizeInBytes, hex, hexRepresentationOfScriptSize] = BlockDataFileDecoder.parseVarInt(hex);
        currentTransaction += hexRepresentationOfScriptSize;

        // the next scriptSizeInBytes bytes are the script
        currentTransaction += BlockDataFileDecoder.getNextNBytesInAHexString(hex, scriptSizeInBytes);
        hex = BlockDataFileDecoder.removeFirstNBytesFromHexString(hex, scriptSizeInBytes);

        // the next 4 bytes are input sequence
        currentTransaction += BlockDataFileDecoder.getNextNBytesInAHexString(hex, 4);
        hex = BlockDataFileDecoder.removeFirstNBytesFromHexString(hex, 4);
      }

      // the next few bytes are varInt denoting the number of outputs
      let varIntHexRepresentationOfOutputCount: string;
      let numberOfOutputs: number;
      [numberOfOutputs, hex, varIntHexRepresentationOfOutputCount] = BlockDataFileDecoder.parseVarInt(hex);
      currentTransaction += varIntHexRepresentationOfOutputCount;

      // for each output
      for (let outputCount = 1; outputCount <= numberOfOutputs; outputCount++) {
        // the first 8 bytes are the value in satoshis
        currentTransaction += BlockDataFileDecoder.getNextNBytesInAHexString(hex, 8);
        hex = BlockDataFileDecoder.removeFirstNBytesFromHexString(hex, 8);

        // the next few bytes denote the scriptPubKeySize in varInt
        let scriptPubKeySizeInBytes: number;
        let hexRepresentationOfScriptPubKeySize: string;
        [scriptPubKeySizeInBytes, hex, hexRepresentationOfScriptPubKeySize] = BlockDataFileDecoder.parseVarInt(hex);
        currentTransaction += hexRepresentationOfScriptPubKeySize;

        // the next scriptPubKeySizeInBytes bytes are the scriptPubKey
        currentTransaction += BlockDataFileDecoder.getNextNBytesInAHexString(hex, scriptPubKeySizeInBytes);
        hex = BlockDataFileDecoder.removeFirstNBytesFromHexString(hex, scriptPubKeySizeInBytes);
      }

      // if is bip144, it needs to parse the witnesses
      if (isBip144) {
        // each input has a witness so for each input
        for (let inputCount = 1; inputCount <= numberOfInputs; inputCount++) {
          // next few bytes denote the number of witness items for this input
          let numberOfWitnesses: number;
          let hexRepresentationOfNumOfWitnesses: string;
          [numberOfWitnesses, hex, hexRepresentationOfNumOfWitnesses] = BlockDataFileDecoder.parseVarInt(hex);
          currentTransaction += hexRepresentationOfNumOfWitnesses;

          // for each witness
          for (let witnessCount = 1; witnessCount <= numberOfWitnesses; witnessCount++) {
            // first few bytes of a witness denotes how many bytes the witness script spans
            let witnessSizeInBytes: number;
            let hexRepresentationOfWitnessSize: string;
            [witnessSizeInBytes, hex, hexRepresentationOfWitnessSize] = BlockDataFileDecoder.parseVarInt(hex);
            currentTransaction += hexRepresentationOfWitnessSize;

            // next witnessSizeInBytes bytes are the witness script
            currentTransaction += BlockDataFileDecoder.getNextNBytesInAHexString(hex, witnessSizeInBytes);
            hex = BlockDataFileDecoder.removeFirstNBytesFromHexString(hex, witnessSizeInBytes);
          }
        }
      }

      // the final 4 bytes are the lockTime
      currentTransaction += BlockDataFileDecoder.getNextNBytesInAHexString(hex, 4);
      hex = BlockDataFileDecoder.removeFirstNBytesFromHexString(hex, 4);

      // finished parsing, add to the returned array
      transactionHexes.push(currentTransaction);
    }

    return [transactionHexes, hex];
  }

  /**
   * Returns the value of the varInt in base 10 stripped input hex, and the hex representation of the varInt
   * VarInt is a variable integer.
   * It can either be a 1 byte hex representation of an int
   * or 2 byte int with prefix fd (total of 3 bytes)
   * or 4 byte int with prefix fe (total of 5 bytes)
   * or 8 byte int with prefix ff (total of 9 bytes)
   * @param hex the hex to parse the varInt from
   */
  private static parseVarInt (hex: string): [number, string, string] {
    const varIntPrefixMap = new Map();
    varIntPrefixMap.set('fd', 2);
    varIntPrefixMap.set('fe', 4);
    varIntPrefixMap.set('ff', 8);

    // 1 byte denotes the varInt
    const varInt = BlockDataFileDecoder.getNextNBytesInAHexString(hex, 1);
    hex = BlockDataFileDecoder.removeFirstNBytesFromHexString(hex, 1);
    let value: number;
    let varIntWithPrefix: string;
    if (!varIntPrefixMap.has(varInt)) {
      // this means we take the hex as is
      value = parseInt(varInt, 16);
      varIntWithPrefix = varInt;
    } else {
      const bytesToRead = varIntPrefixMap.get(varInt);
      // this means the next 2, 4 or 8 bytes are varInt in little endian depending on the prefix
      const varIntValueHexLittleEndian = BlockDataFileDecoder.getNextNBytesInAHexString(hex, bytesToRead);
      const varIntValueHexBigEndian = BlockDataFileDecoder.littleToBigEndian(varIntValueHexLittleEndian);
      value = parseInt(varIntValueHexBigEndian, 16);
      hex = BlockDataFileDecoder.removeFirstNBytesFromHexString(hex, bytesToRead);
      varIntWithPrefix = varInt + varIntValueHexLittleEndian;
    }

    return [value, hex, varIntWithPrefix];
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

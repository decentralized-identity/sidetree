import AnchoredData from './models/AnchoredData';
import Encoder from './Encoder';
import ErrorCode from './ErrorCode';
import { SidetreeError } from '../../Error';

/**
 * Encapsulates functionality to serialize/deserialize data that read/write to
 * the blockchain.
 */
export default class AnchoredDataSerializer {

  private static readonly delimiter = '.';
  private static readonly maxUnsignedIntegerValue = 0xFFFFFFFF;

  /**
   * Converts the given inputs to the string that is to be written to the blockchain.
   *
   * @param dataToBeAnchored The data to serialize.
   */
  public static serialize (dataToBeAnchored: AnchoredData): string {

    // First convert the number of operations input into a 3-byte buffer and then base64 encode it
    const numberAsBuffer = AnchoredDataSerializer.convertToBytesBuffer(dataToBeAnchored.numberOfOperations);
    const encodedNumberOfOperations = Encoder.encode(numberAsBuffer);

    // Concatenate the inputs w/ the delimiter and return
    return `${encodedNumberOfOperations}${AnchoredDataSerializer.delimiter}${dataToBeAnchored.anchorFileHash}`;
  }

  /**
   * Deserializes the given string that is read from the blockchain into data.
   *
   * @param serializedData The data to be deserialized.
   */
  public static deserialize (serializedData: string): AnchoredData {

    const splitData = serializedData.split(AnchoredDataSerializer.delimiter);

    if (splitData.length !== 2) {
      throw new SidetreeError(ErrorCode.AnchoredDataIncorrectFormat, `Input is not in correct format: ${serializedData}`);
    }

    const decodedNumberOfOperations = Encoder.decodeAsBuffer(splitData[0]);
    const numberOfOperations = AnchoredDataSerializer.convertFromBytesBuffer(decodedNumberOfOperations);

    return {
      anchorFileHash: splitData[1],
      numberOfOperations: numberOfOperations
    };
  }

  private static convertToBytesBuffer (numberOfOperations: number): Buffer {

    if (!Number.isInteger(numberOfOperations)) {
      throw new SidetreeError(ErrorCode.AnchoredDataNumberOfOperationsNotInteger, `Number of operations ${numberOfOperations} must be an integer.`);
    }

    if (numberOfOperations < 0) {
      throw new SidetreeError(ErrorCode.AnchoredDataNumberOfOperationsLessThanZero, `Number of operations ${numberOfOperations} must be greater than 0`);
    }

    if (numberOfOperations > this.maxUnsignedIntegerValue) {
      // We are only using 4 bytes to store the number of operations so any number greater than
      // that is not allowed.
      throw new SidetreeError(ErrorCode.AnchoredDataNumberOfOperationsGreaterThanMax,
                              `Number of operations ${numberOfOperations} must be less than equal to ${this.maxUnsignedIntegerValue}`);
    }

    // First write the input into a 4 bytes buffer. Little Endian format.
    const byteArrayBuffer = Buffer.alloc(4);
    byteArrayBuffer.writeUInt32LE(numberOfOperations, 0);

    return byteArrayBuffer;
  }

  private static convertFromBytesBuffer (bytesBuffer: Buffer): number {

    // Ensure that the input has 4 bytes
    if (bytesBuffer.length !== 4) {
      throw new SidetreeError(ErrorCode.AnchoredDataNumberOfOperationsNotFourBytes,
                              `Input must have 3 bytes but have ${bytesBuffer.length} bytes instead.`);
    }

    return bytesBuffer.readUInt32LE(0);
  }
}

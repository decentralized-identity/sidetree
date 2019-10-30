import AnchoredData from './models/AnchoredData';
import Encoder from './Encoder';
import ErrorCode from './ErrorCode';
import { SidetreeError } from '../../Error';

/**
 * Encapsulates functionality to serialize/deserialize data that read/write to
 * the blockchain.
 */
export default class AnchoredDataSerializer {

  private static readonly delimeter = '.';
  private static readonly maxInThreeBytes = 0xFFFFFF;

  /**
   * Converts the given inputs to the string that is to be written to the blockchain.
   *
   * @param anchorFileAddress The anchor file address to write.
   * @param numberOfOperations The number of operations to write.
   */
  public static serialize (dataToBeAnchored: AnchoredData): string {

    // First convert the number of operations input into a 3-byte buffer and then base64 encode it
    const numberAsBuffer = AnchoredDataSerializer.convertToThreeBytesBuffer(dataToBeAnchored.numberOfOperations);
    const encodedNumberOfOperations = Encoder.encode(numberAsBuffer);

    // Concatenate the inputs w/ the delimeter and return
    return `${encodedNumberOfOperations}${AnchoredDataSerializer.delimeter}${dataToBeAnchored.anchorFileHash}`;
  }

  /**
   * Deserializes the given string that is read from the blockchain into data.
   *
   * @param serializedData The data to be deserialized.
   */
  public static deserialize (serializedData: string): AnchoredData {

    const splitData = serializedData.split(AnchoredDataSerializer.delimeter);

    if (splitData.length < 2) {
      throw new SidetreeError(ErrorCode.AnchoredDataIncorrectFormat, `Input is not in correct format: ${serializedData}`);
    }

    const decodedNumberOfOperations = Encoder.decodeAsBuffer(splitData[0]);
    const numberOfOperations = AnchoredDataSerializer.convertFromThreeBytesBuffer(decodedNumberOfOperations);

    return {
      anchorFileHash: splitData[1],
      numberOfOperations: numberOfOperations
    };
  }

  private static convertToThreeBytesBuffer (numberOfOperations: number): Buffer {

    if (numberOfOperations < 0) {
      // We are going to write the number as unint32
      throw new SidetreeError(ErrorCode.AnchoredDataNumberOfOperationsLessThanZero, `Number of operations ${numberOfOperations} must be greater than 0`);
    }

    if (numberOfOperations > this.maxInThreeBytes) {
      // We are only using 3 bytes to store the number of operations so any number greater than
      // that is not allowed.
      throw new SidetreeError(ErrorCode.AnchoredDataNumberOfOperationsGreaterThanMax,
                              `Number of operations ${numberOfOperations} must be less than equal to ${this.maxInThreeBytes}`);
    }

    // First write the input into a 4 bytes buffer. Big Endian format.
    // Example
    //  input: 1000 will be converted to: [0, 0, 3, 232]
    const byteArrayBuffer = Buffer.alloc(4);
    byteArrayBuffer.writeUInt32BE(numberOfOperations, 0);

    // Remove the first byte (because of Big Endian) and return the rest
    return byteArrayBuffer.slice(1, 4);
  }

  private static convertFromThreeBytesBuffer (threeBytesBuffer: Buffer): number {

    // Ensure that the input has 3 bytes
    if (threeBytesBuffer.length !== 3) {
      throw new SidetreeError(ErrorCode.AnchoredDataNumberOfOperationsNotThreeBytes, 
                              `Input must have 3 bytes but have ${threeBytesBuffer.length} bytes instead.`);
    }

    // Convert it into 4 bytes (by adding a dummy 0 byte at the start for Big Endian)
    // and then read uint32 from it.
    const fourBytesBuffer = Buffer.alloc(4);
    fourBytesBuffer[0] = 0;
    fourBytesBuffer[1] = threeBytesBuffer[0];
    fourBytesBuffer[2] = threeBytesBuffer[1];
    fourBytesBuffer[3] = threeBytesBuffer[2];

    return fourBytesBuffer.readUInt32BE(0);
  }
}

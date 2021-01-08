import AnchoredData from './models/AnchoredData';
import ErrorCode from './ErrorCode';
import ProtocolParameters from './ProtocolParameters';
import SidetreeError from '../../../common/SidetreeError';

/**
 * Encapsulates functionality to serialize/deserialize data that read/write to
 * the blockchain.
 */
export default class AnchoredDataSerializer {

  /** Delimiter between logical parts in anchor string. */
  public static readonly delimiter = '.';

  /**
   * Converts the given inputs to the string that is to be written to the blockchain.
   *
   * @param dataToBeAnchored The data to serialize.
   */
  public static serialize (dataToBeAnchored: AnchoredData): string {
    // Concatenate the inputs w/ the delimiter and return
    return `${dataToBeAnchored.numberOfOperations}${AnchoredDataSerializer.delimiter}${dataToBeAnchored.coreIndexFileUri}`;
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

    const numberOfOperations = AnchoredDataSerializer.parsePositiveInteger(splitData[0]);

    if (numberOfOperations > ProtocolParameters.maxOperationsPerBatch) {
      throw new SidetreeError(
        ErrorCode.AnchoredDataNumberOfOperationsGreaterThanMax,
        `Number of operations ${numberOfOperations} must be less than or equal to ${ProtocolParameters.maxOperationsPerBatch}`
      );
    }

    return {
      coreIndexFileUri: splitData[1],
      numberOfOperations: numberOfOperations
    };
  }

  private static parsePositiveInteger (input: string): number {
    // NOTE:
    // /<expression>/ denotes regex.
    // ^ denotes beginning of string.
    // $ denotes end of string.
    // [1-9] denotes leading '0' not allowed.
    // \d* denotes followed by 0 or more decimal digits.
    const isPositiveInteger = /^[1-9]\d*$/.test(input);

    if (!isPositiveInteger) {
      throw new SidetreeError(
        ErrorCode.AnchoredDataNumberOfOperationsNotPositiveInteger,
        `Number of operations '${input}' is not a positive integer without leading zeros.`
      );
    }

    return Number(input);
  }
}

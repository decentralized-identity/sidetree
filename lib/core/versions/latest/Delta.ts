import ErrorCode from './ErrorCode';
import JsonCanonicalizer from './util/JsonCanonicalizer';
import Logger from '../../../common/Logger';
import Operation from './Operation';
import ProtocolParameters from './ProtocolParameters';
import SidetreeError from '../../../common/SidetreeError';

/**
 * Class containing reusable operation delta functionalities.
 */
export default class Delta {

  /**
   * Validates that delta is not null or undefined
   */
  private static validateDeltaIsDefined (delta: any) {
    if (delta === undefined || delta === null) {
      throw new SidetreeError(ErrorCode.DeltaIsNullOrUndefined, `Delta is ${delta}`);
    }
  }

  /**
   * Validates size of the delta object
   */
  public static validateDelta (delta: any) {
    // null and undefined cannot be turned into buffer
    Delta.validateDeltaIsDefined(delta);
    const size = Buffer.byteLength(JsonCanonicalizer.canonicalizeAsBuffer(delta));
    if (size > ProtocolParameters.maxDeltaSizeInBytes) {
      const errorMessage = `${size} bytes of 'delta' exceeded limit of ${ProtocolParameters.maxDeltaSizeInBytes} bytes.`;
      Logger.info(errorMessage);
      throw new SidetreeError(ErrorCode.DeltaExceedsMaximumSize, errorMessage);
    }

    // Validate against delta schema.
    Operation.validateDelta(delta);
  }
}

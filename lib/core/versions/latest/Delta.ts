import ErrorCode from './ErrorCode';
import ProtocolParameters from './ProtocolParameters';
import SidetreeError from '../../../common/SidetreeError';

/**
 * Class containing reusable operation delta functionalities.
 */
export default class Delta {

  /**
   * Validates size of the encoded delta string.
   * @throws `SidetreeError` if fails validation.
   */
  public static validateEncodedDeltaSize (encodedDelta: string) {
    const deltaBuffer = Buffer.from(encodedDelta);
    if (deltaBuffer.length > ProtocolParameters.maxDeltaSizeInBytes) {
      const errorMessage = `${deltaBuffer.length} bytes of 'delta' exceeded limit of ${ProtocolParameters.maxDeltaSizeInBytes} bytes.`;
      console.info(errorMessage);
      throw new SidetreeError(ErrorCode.DeltaExceedsMaximumSize, errorMessage);
    }
  }
}

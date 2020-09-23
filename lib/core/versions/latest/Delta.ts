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

  /**
   * Validates size of the delta object
   * TODO: SIP 2 #781 make observer check that the chunk file is cannonicalized, so we know that no filler characters are used
   * Once we know there are no filler characters, it is valid to do size check on delta object because we know the object size === size in file
   */
  public static validateDeltaSize (delta: object) {
    const size = Buffer.byteLength(JSON.stringify(delta), 'utf8');
    if (size > ProtocolParameters.maxDeltaSizeInBytes) {
      const errorMessage = `${size} bytes of 'delta' exceeded limit of ${ProtocolParameters.maxDeltaSizeInBytes} bytes.`;
      console.info(errorMessage);
      throw new SidetreeError(ErrorCode.DeltaExceedsMaximumSize, errorMessage);
    }
  }
}

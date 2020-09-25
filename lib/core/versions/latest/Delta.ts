import ErrorCode from './ErrorCode';
import JsonCanonicalizer from './util/JsonCanonicalizer';
import ProtocolParameters from './ProtocolParameters';
import SidetreeError from '../../../common/SidetreeError';

/**
 * Class containing reusable operation delta functionalities.
 */
export default class Delta {

  /**
   * Validates size of the encoded delta string.
   * TODO: SIP 2 #781 delete this and use validateDeltaSize only in chunk file
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
   */
  public static validateDeltaSize (delta: object) {
    const size = Buffer.byteLength(JsonCanonicalizer.canonicalizeAsBuffer(delta));
    if (size > ProtocolParameters.maxDeltaSizeInBytes) {
      const errorMessage = `${size} bytes of 'delta' exceeded limit of ${ProtocolParameters.maxDeltaSizeInBytes} bytes.`;
      console.info(errorMessage);
      throw new SidetreeError(ErrorCode.DeltaExceedsMaximumSize, errorMessage);
    }
  }
}

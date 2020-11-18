import Encoder from './Encoder';
import ErrorCode from './ErrorCode';
import Multihash from './Multihash';
import ProtocolParameters from './ProtocolParameters';
import SidetreeError from '../../../common/SidetreeError';

/**
 * Class containing generic input validation methods.
 */
export default class InputValidator {
  /**
   * Validates that the given input is of a non-array object type.
   * @param inputContextForErrorLogging This string is used for error logging purposes only. e.g. 'document', or 'suffix data'.
   */
  public static validateNonArrayObject (input: any, inputContextForErrorLogging: string) {
    if (typeof input !== 'object') {
      throw new SidetreeError(ErrorCode.InputValidatorInputIsNotAnObject, `Input ${inputContextForErrorLogging} is not an object.`);
    }

    if (Array.isArray(input)) {
      throw new SidetreeError(ErrorCode.InputValidatorInputCannotBeAnArray, `Input ${inputContextForErrorLogging} object cannot be an array.`);
    }
  }

  /**
   * Validates that the given object only contains allowed properties.
   * @param inputContextForErrorLogging This string is used for error logging purposes only. e.g. 'document', or 'suffix data'.
   */
  public static validateObjectContainsOnlyAllowedProperties (input: object, allowedProperties: string[], inputContextForErrorLogging: string) {
    const allowedPropertiesSet = new Set(allowedProperties);
    for (const property in input) {
      if (!allowedPropertiesSet.has(property)) {
        throw new SidetreeError(
          ErrorCode.InputValidatorInputContainsNowAllowedProperty,
          `Property '${property}' is not allowed in '${inputContextForErrorLogging}' object.`
        );
      }
    }
  }

  /**
   * Validates that the given input is a valid CAS File URI.
   * @param inputContextForErrorLogging This string is used for error logging purposes only. e.g. 'document', or 'suffix data'.
   */
  public static validateCasFileUri (casFileUri: any, inputContextForErrorLogging: string) {
    const casFileUriType = typeof casFileUri;
    if (casFileUriType !== 'string') {
      throw new SidetreeError(
        ErrorCode.InputValidatorCasFileUriNotString,
        `Input ${inputContextForErrorLogging} CAS file URI '${casFileUri}' needs to be of string type, but is of ${casFileUriType} type instead.`
      );
    }

    const casFileUriAsHashBuffer = Encoder.decodeAsBuffer(casFileUri);
    const hashAlgorithmInMultihashCode = ProtocolParameters.hashAlgorithmInMultihashCode;
    if (!Multihash.isComputedUsingHashAlgorithm(casFileUriAsHashBuffer, hashAlgorithmInMultihashCode)) {
      throw new SidetreeError(
        ErrorCode.InputValidatorCasFileUriUnsupported,
        `Input ${inputContextForErrorLogging} CAS file URI '${casFileUri}' is not computed using hash algorithm of code ${hashAlgorithmInMultihashCode}.`
      );
    }
  }
}

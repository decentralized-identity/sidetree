import ErrorCode from './ErrorCode';
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
}

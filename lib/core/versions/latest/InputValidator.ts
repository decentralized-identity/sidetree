import SidetreeError from "../../../common/SidetreeError";
import ErrorCode from "./ErrorCode";

/**
 * Class containing generic input validation methods.
 */
export default class InputValidator {
  /**
   * Validates that the given input is of a non-array object type.
   */
  public static validateNonArrayObject (input: any) {
    if (typeof input !== 'object' || Array.isArray(input)) {
      throw new SidetreeError(ErrorCode.InputValidatorInputNotANonArrayObject, 'Input not a non-array object.');
    }
  }

  /**
   * Validates that the given object only contains allowed properties.
   */
  public static validateObjectOnlyContainsAllowedProperties (input: object, allowedProperties: string[]) {
    const allowedPropertiesSet = new Set(allowedProperties);
    for (const property in input) {
      if (!allowedPropertiesSet.has(property)) {
        throw new SidetreeError(ErrorCode.InputValidatorInputContainsNowAllowedProperty, `Property '${property}' is not allowed.`);
      }
    }
  }
}

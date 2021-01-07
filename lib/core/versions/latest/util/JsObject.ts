/**
 * Class containing JavaScript object operations.
 */
export default class JsObject {
  /**
   * Deep copies the given input.
   */
  public static deepCopyObject (input: any): any {
    if (typeof input !== 'object') {
      return input;
    }

    const deepCopy: any = Array.isArray(input) ? [] : {};

    for (const key in input) {
      const value = input[key];

      // Recursively deep copy properties.
      deepCopy[key] = JsObject.deepCopyObject(value);
    }

    return deepCopy;
  }

  /**
   * Clears all the properties in the given object.
   */
  public static clearObject (input: any) {
    for (const key in input) {
      delete input[key];
    }
  }
}

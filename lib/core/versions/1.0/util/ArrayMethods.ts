/**
 * Class containing methods that operates against an array.
 */
export default class ArrayMethods {
  /**
   * Checks to see if there are duplicates in the given array.
   */
  public static hasDuplicates<T> (array: Array<T>): boolean {
    const uniqueValues = new Set<T>();

    for (let i = 0; i < array.length; i++) {
      const value = array[i];
      if (uniqueValues.has(value)) {
        return true;
      }
      uniqueValues.add(value);
    }

    return false;
  }

  /**
   * Checks that entries in array 2 is not in array 1.
   */
  public static areMutuallyExclusive<T> (array1: Array<T>, array2: Array<T>): boolean {
    const valuesInArray1 = new Set<T>(array1);

    for (const value of array2) {
      if (valuesInArray1.has(value)) {
        return false;
      }
    }

    return true;
  }
}

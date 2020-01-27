/**
 * Provides utility static functions to run length compress an array
 * and uncompress a previously compressed array.
 */
export default class RunLengthTransformer {
  /**
   * Run-length encode an array: The array `[0,0,0,1,1]` becomes
   * `[0,3,1,2]`.
   */
  public static encode(array: number[]): number[] {
    if (array.length === 0) {
      return array;
    }

    const runLengthArray = new Array();

    let value = array[0];
    let count = 1;
    for (let i = 1; i < array.length; i++) {
      if (array[i] === value) {
        count++;
      } else {
        runLengthArray.push(value);
        runLengthArray.push(count);
        value = array[i];
        count = 1;
      }
    }

    runLengthArray.push(value);
    runLengthArray.push(count);

    return runLengthArray;
  }

  /** Inverse of run-length encode. */
  public static decode(array: number[]): number[] {
    if (array.length % 2 !== 0 || array.length === 0) {
      throw Error(
        `Invalid array length for runlength decoding: ${array.length}`
      );
    }

    const retArray = new Array();
    for (let i = 0; i < array.length; ) {
      let value = array[i++];
      let count = array[i++];

      for (let j = 0; j < count; j++) {
        retArray.push(value);
      }
    }

    return retArray;
  }
}

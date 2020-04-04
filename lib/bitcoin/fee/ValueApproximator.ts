/**
 * Value approximator is used to normalize values to a compact range while
 * providing the ability to denormalize the normalized values to an approximation
 * of the original value.
 *
 * For example, if we use approximation 2, the number 3 and 4 would be normalized to 3,
 * 5,6,7,8 would be normalized to 4, and so on. Denormalization would denormalize 3 to 4,
 * 4 to 8, and so on. If we take a number n, the number denormalize(normalize(n)) would be
 * larger than n, but at most by a factor 2.
 *
 * We can replace 2 in the argument above with a value closer to 1 (say 1.1), and all values
 * will be approximated by a factor at most 1.1.
 */
export default class ValueApproximator {

  public constructor (private approximation: number, private maxValue: number) {

  }

  /**
   * Get the maximum normalized value.
   */
  public getMaximumNormalizedValue (): number {
    return this.getNormalizedValue(this.maxValue);
  }

  /**
   * Normalize a value.
   */
  public getNormalizedValue (value: number): number {
    if (value <= 0) {
      return 0;
    }

    if (value >= this.maxValue) {
      value = this.maxValue;
    }

    return 1 + ValueApproximator.getLog(value, this.approximation);
  }

  /**
   * Get the denormalized value of a normalized value.
   */
  public getDenormalizedValue (normalizedValue: number): number {
    if (normalizedValue === 0) {
      return 0;
    }
    return Math.pow(this.approximation, normalizedValue - 1);
  }

  /**
   * Get the integer part of logarithm of a number n with base b.
   */
  private static getLog (n: number, b: number): number {
    // Just return the number if the base == 1
    if (b === 1) {
      return n;
    }

    let i = 1;
    let log = 0;
    for (log = 0 ; i < n ; log++) {
      i = i * b;
    }
    return log;
  }
}


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
class ValueApproximator {

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
    return Math.round(Math.pow(this.approximation, normalizedValue - 1));
  }

  /**
   * Get the integer part of logarithm of a number n with base b.
   */
  private static getLog (n: number, b: number): number {
    let i = 1;
    let log = 0;
    for (log = 0 ; i < n ; log++) {
      i = i * b;
    }
    return log;
  }
}

// Frequency vector
type FrequencyVector = Array<number>;

/**
 * Define a sliding window quantile computer that computes
 * approximate quantiles over a sliding window.
 * The class exposes methods to add a batch of elements and
 * delete the last batch of elements - to get a sliding window
 * we suitably interleave these two methods. It also provides a
 * method to get the quantile from the current window of elements.
 */
export default class SlidingWindowQuantileComputer {

  /**
   * Normalize values to a compact range 0..max, which allows
   * a large set of values to be stored compactly as frequency
   * vectors of their normalized images.
   */
  private valueApproximator: ValueApproximator;

  /**
   * Size of a frequency vector; 1 + max normalized value
   */
  private frequencyVectorSize: number;

  /**
   * A sliding window is an array of frequency vectors used
   * as a queue. A new batch of elements is added to the end
   * of the queue, and old batch of elements are deleted from
   * the beginning.
   */
  private slidingWindow: Array<FrequencyVector>;

  /**
   * Aggregated frequency vector of all vectors in the current
   * sliding window.
   */
  private frequencyVectorAggregated: FrequencyVector;

  /**
   * Construct a sliding window quantile computer with specified
   * approximation paramenters.
   */
  public constructor (approximation: number, maxValue: number) {
    this.valueApproximator = new ValueApproximator(approximation, maxValue);
    this.frequencyVectorSize = 1 + this.valueApproximator.getMaximumNormalizedValue();
    this.slidingWindow = new Array<FrequencyVector>();
    this.frequencyVectorAggregated = new Array(this.frequencyVectorSize);
  }

  /**
   * Add a new batch of values to the sliding window. This function
   * also materializes (a compact representation) of this batch
   * to a backend mongo store.
   */
  public async add (values: number[]): Promise<void> {
    const normalizedFrequencies = new Array(this.frequencyVectorSize);

    for (let value of values) {
      const normalizedValue = this.valueApproximator.getNormalizedValue(value);
      normalizedFrequencies[normalizedValue]++;
    }

    this.slidingWindow.push(normalizedFrequencies);

    for (let i = 0 ; i < this.frequencyVectorSize ; i++) {
      this.frequencyVectorAggregated[i] += normalizedFrequencies[i];
    }

    return;
  }

  /**
   * Delete the last batch of values from the sliding window.
   */
  public async deleteLast (): Promise<void> {
    const deletedFrequencyVector = this.slidingWindow.shift();

    if (deletedFrequencyVector) {
      for (let i = 0 ; i < this.frequencyVectorSize ; i++) {
        this.frequencyVectorAggregated[i] -= deletedFrequencyVector[i];
      }
    }

    return;
  }

  /**
   * Get a specified quantile in the current sliding window.
   */
  public getQuantile (quantile: number): number {

    if (quantile < 0 || quantile > 1) {
      throw Error(`Invalid quantile measure ${quantile}`);
    }

    // Number of elements in the sliding window;
    const elementCount = this.frequencyVectorAggregated.reduce((a,b) => a + b, 0);

    // Rank of the element
    const rankThreshold = quantile * elementCount;

    let runSum = 0;
    for (let i = 0 ; i < this.frequencyVectorSize ; i++) {
      runSum += this.frequencyVectorAggregated[i];
      if (runSum >= rankThreshold) {
        return this.valueApproximator.getDenormalizedValue(i);
      }
    }

    // should never come here.
    return 0;
  }
}

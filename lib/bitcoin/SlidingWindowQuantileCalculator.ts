import { QuantileInfo, SlidingWindowQuantileMongoStore } from './SlidingWindowQuantileMongoStore';

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
export class ValueApproximator {

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

/**
 * Run-length encode an array: The array `[0,0,0,1,1]` becomes
 * `[0,3,1,2]`.
 */
export function runLengthEncode (array: number[]): number[] {
  if (array.length === 0) {
    return array;
  }

  const runLengthArray = new Array();

  let value = array[0];
  let count = 1;
  for (let i = 1 ; i < array.length ; i++) {
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
export function runLengthDecode (array: number[]): number[] {
  if (((array.length) % 2 !== 0) || (array.length === 0)) {
    throw Error(`Invalid array length for runlength decoding: ${array.length}`);
  }

  const retArray = new Array();
  for (let i = 0 ; i < array.length ;) {
    let value = array[i++];
    let count = array[i++];

    for (let j = 0 ; j < count ; j++) {
      retArray.push(value);
    }
  }

  return retArray;
}

/**
 * Frequency vector is an array of numbers representing frequencies of
 * normalized values.
 */
type FrequencyVector = Array<number>;

/**
 * Define a sliding window quantile calculator that computes
 * approximate quantiles over a sliding window. Elements
 * are added to sliding windows in batches, where each bag
 * is a collection of values. The sliding window size is
 * specified in number of batches: when the i'th batch is added,
 * all the elements added in (i-N)th batch are removed where
 * N is the size of the sliding window.
 *
 */
export class SlidingWindowQuantileCalculator {

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
   * The latest sliding window consisting of the last 'size'
   * batches of elements, where each batch is compactly represented
   * as (normalized-element, frequency) frequency vector.
   */
  private slidingWindow: Array<FrequencyVector>;

  /**
   * Aggregated frequency vector of all vectors in the current
   * sliding window.
   */
  private frequencyVectorAggregated: FrequencyVector;

  /**
   * Historical quantiles: historicalQuantiles.get(batchId) stores the quantile
   * when batch batchId was added.
   */
  private historicalQuantiles: Map<number, number> = new Map();

  /** Most recent batchId we have seen */
  private prevBatchId: number | undefined = undefined;

  private mongoStore: SlidingWindowQuantileMongoStore;

  /**
   * Construct a sliding window quantile computer with specified
   * approximation paramenters.
   */
  public constructor (approximation: number,
    maxValue: number,
    private readonly size: number,
    private readonly quantile: number,
    mongoServerUrl: string,
    database?: string
    ) {
    this.valueApproximator = new ValueApproximator(approximation, maxValue);
    this.frequencyVectorSize = 1 + this.valueApproximator.getMaximumNormalizedValue();
    this.slidingWindow = new Array<FrequencyVector>();
    this.frequencyVectorAggregated = new Array(this.frequencyVectorSize);
    this.mongoStore = new SlidingWindowQuantileMongoStore(mongoServerUrl, database);
    if (this.quantile < 0 || this.quantile > 1) {
      throw Error(`Invalid quantile measure ${quantile}`);
    }
  }

  /** Initialize self from state stored in mongo store */
  public async initialize (): Promise<void> {
    await this.mongoStore.initialize();
    const firstBatchId = await this.mongoStore.getFirstBatchId();
    const lastBatchId = await this.mongoStore.getLastBatchId();

    if (firstBatchId) {
      for (let batchId = firstBatchId ; batchId <= lastBatchId! ; batchId++) {
        const quantileInfo = (await this.mongoStore.get(batchId))!;

        this.historicalQuantiles.set(batchId, quantileInfo.quantile);

        if (batchId + this.size > lastBatchId!) {
          const batchFrequencyVector = runLengthDecode(quantileInfo.batchFreqVector);
          this.slidingWindow.push(batchFrequencyVector);

          for (let i = 0 ; i < this.frequencyVectorSize ; i++) {
            this.frequencyVectorAggregated[i] += batchFrequencyVector[i];
          }
        }
      }
    }
  }

  /**
   * Add a new batch of values to the sliding window. Each batch is
   * identified using a batchId which can be used to retrieve historical
   * quantiles as of a particular batchId.
   */
  public async add (batchId: number, batch: number[]): Promise<void> {

    // Our historical quantiles storage logic relies on batchIds being
    // consecutive numbers: explicitly check this fact.
    if (this.prevBatchId) {
      if (this.prevBatchId + 1 !== batchId) {
        throw Error(`Quantile calculator batchIds not sequential`);
      }
    }
    this.prevBatchId = batchId;

    const batchFrequencyVector = new Array(this.frequencyVectorSize);

    for (let value of batch) {
      const normalizedValue = this.valueApproximator.getNormalizedValue(value);
      batchFrequencyVector[normalizedValue]++;
    }

    this.slidingWindow.push(batchFrequencyVector);

    for (let i = 0 ; i < this.frequencyVectorSize ; i++) {
      this.frequencyVectorAggregated[i] += batchFrequencyVector[i];
    }

    if (this.slidingWindow.length > this.size) {
      await this.deleteLast();
    }

    // calculate and materialize the quantile as of this batchId
    this.historicalQuantiles.set(batchId, this.calculateCurrentQuantile());

    return;
  }

  /**
   * Get the quantile as of a specific batchId.
   */
  public getQuantile (batchId: number): number | undefined {
    return this.historicalQuantiles.get(batchId);
  }

  /**
   * Delete the last batch of values from the sliding window.
   */
  private async deleteLast (): Promise<void> {
    // We check that slidingWindow size > this.size > 0, so ! should be safe.
    const deletedFrequencyVector = this.slidingWindow.shift()!;

    for (let i = 0; i < this.frequencyVectorSize; i++) {
      this.frequencyVectorAggregated[i] -= deletedFrequencyVector[i];
    }

    return;
  }

  /**
   * Get a specified quantile in the current sliding window.
   */
  private calculateCurrentQuantile (): number {

    // Number of elements in the sliding window;
    const elementCount = this.frequencyVectorAggregated.reduce((a,b) => a + b, 0);

    // Rank of the element
    const rankThreshold = this.quantile * elementCount;

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

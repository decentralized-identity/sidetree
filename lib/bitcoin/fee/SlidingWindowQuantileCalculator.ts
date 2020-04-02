import RunLengthTransformer from './RunLengthTransformer';
import ValueApproximator from './ValueApproximator';
import ISlidingWindowQuantileStore from '../interfaces/ISlidingWindowQuantileStore';
import SlidingWindowQuantileStoreInitializer from './SlidingWindowQuantileStoreInitializer';

/**
 * Frequency vector is an array of numbers representing frequencies of
 * normalized values.
 */
type FrequencyVector = Array<number>;

/**
 * Define a sliding window quantile calculator that computes
 * approximate quantiles over a sliding window. Elements
 * are added to sliding windows in groups, where each group
 * is a collection of values. The sliding window size is
 * specified in number of groups: when the i'th group is added,
 * all the elements added in (i-N)th group are removed where
 * N is the size of the sliding window.
 *
 */
export default class SlidingWindowQuantileCalculator {

  /**
   * Normalize values to a compact range 0..max, which allows
   * a large set of values to be stored compactly as frequency
   * vectors of their normalized images.
   */
  private valueApproximator: ValueApproximator;

  /**
   * The value to use as an input to the ValueApproximator.
   */
  private readonly feeApproximate: number = 1.414;
  /**
   * Size of a frequency vector; 1 + max normalized value
   */
  private frequencyVectorSize: number;

  private maxQuantileDeviationPercentageValue: number;

  /**
   * The latest sliding window consisting of the last 'size'
   * groups of elements, where each group is compactly represented
   * as (normalized-element, frequency) frequency vector.
   */
  private slidingWindow: Array<FrequencyVector>;

  /**
   * Aggregated frequency vector of all vectors in the current
   * sliding window.
   */
  private frequencyVectorAggregated: FrequencyVector;

  /**
   * Historical quantiles: historicalQuantiles.get(groupId) stores the quantile
   * when group groupId was added.
   */
  private historicalQuantiles: Map<number, number> = new Map();

  /** Most recent groupId we have seen */
  private prevgroupId: number | undefined = undefined;

  /**
   * Construct a sliding window quantile computer with specified
   * approximation paramenters.
   */
  public constructor (
    maxValue: number,  // all values above maxValue are rounded down by maxValue
    private readonly slidingWindowSize: number, // size of the sliding window used to compute quantiles
    private readonly quantileMeasure: number, // quantile measure (e.g., 0.5) that is tracked by the calculator
    maxQuantileDeviationPercentage: number, // How much is a quantile value allowed to deviate from the previous value
    private readonly genesisBlockNumber: number,
    private readonly mongoStore: ISlidingWindowQuantileStore
    ) {
    this.valueApproximator = new ValueApproximator(this.feeApproximate, maxValue);
    this.frequencyVectorSize = 1 + this.valueApproximator.getMaximumNormalizedValue();
    this.slidingWindow = new Array<FrequencyVector>();
    this.frequencyVectorAggregated = new Array(this.frequencyVectorSize).fill(0);
    this.maxQuantileDeviationPercentageValue = maxQuantileDeviationPercentage / 100;

    if (this.quantileMeasure < 0 || this.quantileMeasure > 1) {
      throw Error(`Invalid quantile measure ${quantileMeasure}`);
    }
  }

  /** Initialize self from state stored in mongo store */
  public async initialize (): Promise<void> {
    await this.mongoStore.initialize();

    // This special call to initialize the quantile db if it is empty.
    await SlidingWindowQuantileStoreInitializer.initializeDatabaseIfEmpty(this.genesisBlockNumber, this.valueApproximator, this.mongoStore);

    const firstGroupId = await this.mongoStore.getFirstGroupId();
    const lastGroupId = await this.mongoStore.getLastGroupId();

    this.frequencyVectorAggregated.fill(0);
    this.slidingWindow = new Array<FrequencyVector>();
    this.prevgroupId = lastGroupId;

    if (firstGroupId !== undefined) {
      for (let groupId = firstGroupId ; groupId <= lastGroupId! ; groupId++) {
        const quantileInfo = (await this.mongoStore.get(groupId))!;

        this.historicalQuantiles.set(groupId, quantileInfo.quantile);

        if (groupId + this.slidingWindowSize > lastGroupId!) {
          const groupFrequencyVector = RunLengthTransformer.decode(quantileInfo.groupFreqVector);
          this.slidingWindow.push(groupFrequencyVector);

          for (let i = 0 ; i < this.frequencyVectorSize ; i++) {
            this.frequencyVectorAggregated[i] += groupFrequencyVector[i];
          }
        }
      }
    }
  }

  /**
   * Add a new group of values to the sliding window. Each group is
   * identified using a groupId which can be used to retrieve historical
   * quantiles as of a particular groupId.
   */
  public async add (groupId: number, group: number[]): Promise<void> {

    // Our historical quantiles storage logic relies on groupIds being
    // consecutive numbers: explicitly check this fact.
    if (this.prevgroupId) {
      if (this.prevgroupId + 1 !== groupId) {
        throw Error(`Quantile calculator groupIds not sequential`);
      }
    }

    const groupFrequencyVector = new Array(this.frequencyVectorSize).fill(0);

    for (let value of group) {
      const normalizedValue = this.valueApproximator.getNormalizedValue(value);
      groupFrequencyVector[normalizedValue]++;
    }

    this.slidingWindow.push(groupFrequencyVector);

    for (let i = 0 ; i < this.frequencyVectorSize ; i++) {
      this.frequencyVectorAggregated[i] += groupFrequencyVector[i];
    }

    if (this.slidingWindow.length > this.slidingWindowSize) {
      await this.deleteLast();
    }

    // calculate and materialize the quantile as of this groupId
    const currentQuantile = this.calculateCurrentQuantile();
    const previousQuantile = this.prevgroupId ? this.historicalQuantiles.get(this.prevgroupId) : undefined;

    const quantile = this.calculateAdjustedQuantile(currentQuantile, previousQuantile);
    this.historicalQuantiles.set(groupId, quantile);

    // store it into mongo store
    const quantileInfo = {
      groupId,
      quantile,
      groupFreqVector: RunLengthTransformer.encode(groupFrequencyVector)
    };
    await this.mongoStore.put(quantileInfo);
    this.prevgroupId = groupId;

    return;
  }

  /**
   * Remove all groups with ids greater than or equal
   * to a provided groupId.
   */
  public async removeGroupsGreaterThanOrEqual (groupId: number): Promise<void> {
    await this.mongoStore.removeGroupsGreaterThanEqualTo(groupId);

    // Re-initialize - slightly inefficient but simplest way to reset our state to the
    // correct value.
    await this.initialize();
  }

  /**
   * Get the quantile as of a specific groupId.
   */
  public getQuantile (groupId: number): number | undefined {
    const quantile = this.historicalQuantiles.get(groupId);

    return quantile ? Math.ceil(quantile) : undefined;
  }

  /**
   * Gets the last group id which is saved in the store.
   */
  public async getLastGroupId (): Promise<number | undefined> {
    return this.mongoStore.getLastGroupId();
  }

  /**
   * Delete the last group of values from the sliding window.
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
    const rankThreshold = this.quantileMeasure * elementCount;

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

  private calculateAdjustedQuantile (currentQuantile: number, previousQuantile: number | undefined): number {
    if (!previousQuantile) {
      return currentQuantile;
    }

    const deviationAllowed = this.maxQuantileDeviationPercentageValue * previousQuantile;

    const lowerLimit = previousQuantile - deviationAllowed;
    const upperLimit = previousQuantile + deviationAllowed;

    if (currentQuantile < lowerLimit) {
      return lowerLimit;
    }

    if (currentQuantile > upperLimit) {
      return upperLimit;
    }

    return currentQuantile;
  }
}

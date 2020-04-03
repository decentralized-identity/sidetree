import ISlidingWindowQuantileStore from '../../../lib/bitcoin/interfaces/ISlidingWindowQuantileStore';
import MockSlidingWindowQuantileStore from '../../mocks/MockSlidingWindowQuantileStore';
import SlidingWindowQuantileCalculator from '../../../lib/bitcoin/fee/SlidingWindowQuantileCalculator';
import SlidingWindowQuantileStoreInitializer from '../../../lib/bitcoin/fee/SlidingWindowQuantileStoreInitializer';

describe('SlidingWindowQuantileCalculator', async () => {
  const maxValue = 128;
  const slidingWindowSize = 2;
  const medianQuantile = 0.5;
  const maxQuantileDeviationPercentage = 100; // Make the factor really large for testing
  const genesisBlockNumber = 1234;
  let slidingWindowQuantileStore: ISlidingWindowQuantileStore;
  let slidingWindowQuantileCalculator: SlidingWindowQuantileCalculator;
  let quantileDbInitializerSpy: jasmine.Spy;

  beforeAll(async () => {
    quantileDbInitializerSpy = spyOn(SlidingWindowQuantileStoreInitializer, 'initializeDatabaseIfEmpty').and.returnValue(Promise.resolve());

    slidingWindowQuantileStore = new MockSlidingWindowQuantileStore();
    slidingWindowQuantileCalculator = new SlidingWindowQuantileCalculator(
      maxValue, slidingWindowSize, medianQuantile, maxQuantileDeviationPercentage, genesisBlockNumber, slidingWindowQuantileStore);
    await slidingWindowQuantileCalculator.initialize();

    spyOn(slidingWindowQuantileCalculator as any, 'calculateAdjustedQuantile').and.callFake((current: any, _previous: any) => current);
  });

  beforeEach(async () => {
    await slidingWindowQuantileStore.clear();
    await slidingWindowQuantileCalculator.removeGroupsGreaterThanOrEqual(0); // clear
  });

  it('should compute correct quantiles for a single group of identical values', async () => {
    const singleValue = 2;
    await slidingWindowQuantileCalculator.add(0, new Array(100).fill(singleValue));
    const quantile = slidingWindowQuantileCalculator.getQuantile(0);
    expect(quantile).toBeDefined();
    expect(quantile!).toBe(3);
  });

  it('should compute correct median with distinct values', async () => {
    const values = new Array(100);
    for (let i = 0 ; i < values.length ; ++i) {
      values[i] = i;
    }

    await slidingWindowQuantileCalculator.add(0, values);
    const quantile = slidingWindowQuantileCalculator.getQuantile(0);
    expect(quantile).toBeDefined();
    expect(quantile).toBe(64); // This value changes based on the valueApproximation field
  });

  it('should compute correct median at boundary', async () => {
    // values has 50x2 and 50x4, so 2 is the median
    const values = new Array(100);
    for (let i = 0 ; i < 50 ; i++) {
      values[i] = 4;
    }
    for (let i = 50 ; i < 100 ; i++) {
      values[i] = 2;
    }

    await slidingWindowQuantileCalculator.add(0, values);
    const quantile = slidingWindowQuantileCalculator.getQuantile(0);
    expect(quantile).toBeDefined();
    expect(quantile).toBe(3);
  });

  it('should compute correct median at boundary (higher)', async () => {
    // values has 49x2 and 51x4, so 4 is the median
    const values = new Array(100);
    for (let i = 0 ; i < 51 ; i++) {
      values[i] = 4;
    }
    for (let i = 51 ; i < 100 ; i++) {
      values[i] = 2;
    }

    await slidingWindowQuantileCalculator.add(0, values);
    const quantile = slidingWindowQuantileCalculator.getQuantile(0);
    expect(quantile).toBeDefined();
    expect(quantile).toBe(6);
  });

  it('should compute correct median modulo permutation', async () => {
    // values is [99, 98, ..., 0 ], not a random permutation but given the logic
    // of using frequency vectors, very unlikely we should have a bug sensitive to the
    // permutation.
    const values = new Array(100);
    for (let i = 0 ; i < values.length ; ++i) {
      values[i] = 99 - i;
    }

    await slidingWindowQuantileCalculator.add(0, values);
    const quantile = slidingWindowQuantileCalculator.getQuantile(0);
    expect(quantile).toBeDefined();
    expect(quantile).toBe(64); // This value changes based on the valueApproximation field
  });

  it('should compute correct median with a window', async () => {
    // 0: 4x100
    await slidingWindowQuantileCalculator.add(0, new Array(100).fill(4));

    // 1: 2x100
    await slidingWindowQuantileCalculator.add(1, new Array(100).fill(2));

    const quantile0 = slidingWindowQuantileCalculator.getQuantile(0);
    expect(quantile0).toBeDefined();
    expect(quantile0!).toBe(6);

    const quantile1 = slidingWindowQuantileCalculator.getQuantile(1);
    expect(quantile1).toBeDefined();
    expect(quantile1!).toBe(3);
  });

  it('should correctly slide out old groups', async () => {
    // 0: 2x100
    await slidingWindowQuantileCalculator.add(0, new Array(100).fill(2));

    // 1: 4x100
    await slidingWindowQuantileCalculator.add(1, new Array(100).fill(4));

    const quantile0 = slidingWindowQuantileCalculator.getQuantile(0);
    expect(quantile0).toBeDefined();
    expect(quantile0!).toBe(3);

    const quantile1 = slidingWindowQuantileCalculator.getQuantile(1);
    expect(quantile1).toBeDefined();
    expect(quantile1!).toBe(3);

    // 2: 2x99, 1x4; if the first group is slided out, the resulting
    // frequency is [4x100, 4, 2x99], so median is 4;
    // if there is a bug and it is not slided out, the result would be
    // [2x100, 4x100, 4, 2x99], so median would be 2.
    const group2 = new Array(100).fill(2);
    group2[0] = 4;
    await slidingWindowQuantileCalculator.add(2, group2);

    const quantile2 = slidingWindowQuantileCalculator.getQuantile(2);
    expect(quantile2).toBeDefined();
    expect(quantile2!).toBe(6);
  });

  it('should correctly initialize itself from store', async () => {
    // 0: 2x100
    await slidingWindowQuantileCalculator.add(0, new Array(100).fill(2));

    // 1: 4x100
    await slidingWindowQuantileCalculator.add(1, new Array(100).fill(4));

    // start a new calculator with the same store
    slidingWindowQuantileCalculator = new SlidingWindowQuantileCalculator(
      maxValue, slidingWindowSize, medianQuantile, maxQuantileDeviationPercentage, genesisBlockNumber, slidingWindowQuantileStore);
    await slidingWindowQuantileCalculator.initialize();

    expect(quantileDbInitializerSpy).toHaveBeenCalledWith(
      slidingWindowQuantileCalculator['genesisBlockNumber'],
      slidingWindowQuantileCalculator['valueApproximator'],
      slidingWindowQuantileCalculator['mongoStore']);

    const quantile0 = slidingWindowQuantileCalculator.getQuantile(0);
    expect(quantile0).toBeDefined();
    expect(quantile0!).toBe(3);

    const quantile1 = slidingWindowQuantileCalculator.getQuantile(1);
    expect(quantile1).toBeDefined();
    expect(quantile1!).toBe(3);

    // 2: 2x99, 1x4; if the first group is slided out, the resulting
    // frequency is [4x100, 4, 2x99], so median is 4;
    // if there is a bug and it is not slided out, the result would be
    // [2x100, 4x100, 4, 2x99], so median would be 2.
    const group2 = new Array(100).fill(2);
    group2[0] = 4;
    await slidingWindowQuantileCalculator.add(2, group2);

    const quantile2 = slidingWindowQuantileCalculator.getQuantile(2);
    expect(quantile2).toBeDefined();
    expect(quantile2!).toBe(6);
  });

  it('should correctly revert', async () => {
    // 0: 4x100
    await slidingWindowQuantileCalculator.add(0, new Array(100).fill(4));

    // 1: 8x100
    await slidingWindowQuantileCalculator.add(1, new Array(100).fill(8));

    let quantile0 = slidingWindowQuantileCalculator.getQuantile(0);
    expect(quantile0).toBeDefined();
    expect(quantile0!).toBe(6);

    let quantile1 = slidingWindowQuantileCalculator.getQuantile(1);
    expect(quantile1).toBeDefined();
    expect(quantile1!).toBe(6);

    // remove 1
    await slidingWindowQuantileCalculator.removeGroupsGreaterThanOrEqual(1);

    // 1: 2x100
    await slidingWindowQuantileCalculator.add(1, new Array(100).fill(2));

    quantile0 = slidingWindowQuantileCalculator.getQuantile(0);
    expect(quantile0).toBeDefined();
    expect(quantile0!).toBe(6);

    quantile1 = slidingWindowQuantileCalculator.getQuantile(1);
    expect(quantile1).toBeDefined();
    expect(quantile1!).toBe(3);
  });

  describe('calculateAdjustedQuantile', () => {
    let previousValue: number;
    let lowerLimit: number;
    let upperLimit: number;

    beforeEach(() => {
      slidingWindowQuantileCalculator['maxQuantileDeviationPercentageValue'] = 0.01; // 1% deviation allowed
      previousValue = 100;
      lowerLimit = 99;
      upperLimit = 101;
    });

    it('should return the current value if the previous is undefined', () => {
      const currentValue = 1234;
      const actual = slidingWindowQuantileCalculator['calculateAdjustedQuantile'](currentValue, undefined);

      expect(actual).toEqual(currentValue);
    });

    it('should return the current value if it is within the limit', () => {
      const currentValue = lowerLimit + 1;
      const actual = slidingWindowQuantileCalculator['calculateAdjustedQuantile'](currentValue, previousValue);

      expect(actual).toEqual(currentValue);
    });

    it('should return the lower limit if the current value is < lower limt', () => {
      const currentValue = lowerLimit - 1;
      const actual = slidingWindowQuantileCalculator['calculateAdjustedQuantile'](currentValue, previousValue);

      expect(actual).toEqual(lowerLimit);
    });

    it('should return the upper limit if the current value is > upper limit', () => {
      const currentValue = upperLimit + 1;
      const actual = slidingWindowQuantileCalculator['calculateAdjustedQuantile'](currentValue, previousValue);

      expect(actual).toEqual(upperLimit);
    });
  });
});

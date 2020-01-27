import ReservoirSampler from '../../../lib/bitcoin/fee/ReservoirSampler';

describe('ReservoirSampler', () => {
  it('should sample uniformly with sample size 1', () => {
    const reservoirSampler = new ReservoirSampler(1);
    reservoirSampler.resetPsuedoRandomSeed('hello world');
    const maxValue = 10;
    const sampleCount: number[] = new Array(maxValue).fill(0);

    for (let i = 0; i < 10000; ++i) {
      reservoirSampler.clear();
      for (let j = 0; j < maxValue; ++j) {
        reservoirSampler.addElement(j.toString());
      }

      const sample = reservoirSampler.getSample();
      expect(sample.length).toBe(1);
      const sampleInteger = parseInt(sample[0], 10);
      expect(sampleInteger).toBeGreaterThanOrEqual(0);
      expect(sampleInteger).toBeLessThan(maxValue);
      sampleCount[sampleInteger]++;
    }

    const maxSampleCount = Math.max(...sampleCount);
    const minSampleCount = Math.min(...sampleCount);
    expect(minSampleCount).toBeGreaterThan(900);
    expect(maxSampleCount).toBeLessThan(1100);
  });

  it('should sample all elements when stream size <= sample size', () => {
    const sampleSize = 10;
    const reservoirSampler = new ReservoirSampler(sampleSize);
    reservoirSampler.resetPsuedoRandomSeed('hello world');

    for (let i = 0; i < sampleSize; ++i) {
      reservoirSampler.addElement(i.toString());
    }

    const sample = reservoirSampler.getSample();
    expect(sample.length).toBe(sampleSize);
    for (let i = 0; i < sampleSize; ++i) {
      const sampleInteger = parseInt(sample[i], 10);
      expect(sampleInteger).toBe(i);
    }
  });

  it('should sample uniformly with sample size != 1', () => {
    const sampleSize = 9;
    const reservoirSampler = new ReservoirSampler(sampleSize);
    reservoirSampler.resetPsuedoRandomSeed('hello world');
    const maxValue = sampleSize + 1;
    const sampleCount: number[] = new Array(maxValue).fill(0);

    for (let i = 0; i < 10000; ++i) {
      reservoirSampler.clear();
      for (let j = 0; j < maxValue; ++j) {
        reservoirSampler.addElement(j.toString());
      }

      const sample = reservoirSampler.getSample();
      expect(sample.length).toBe(sampleSize);

      const missingInteger =
        (sampleSize * maxValue) / 2 -
        sample.map(s => parseInt(s, 10)).reduce((a, b) => a + b, 0);
      expect(missingInteger).toBeGreaterThanOrEqual(0);
      expect(missingInteger).toBeLessThan(maxValue);

      sampleCount[missingInteger]++;
    }

    console.log(sampleCount);

    const maxSampleCount = Math.max(...sampleCount);
    const minSampleCount = Math.min(...sampleCount);
    expect(minSampleCount).toBeGreaterThan(900);
    expect(maxSampleCount).toBeLessThan(1100);
  });
});

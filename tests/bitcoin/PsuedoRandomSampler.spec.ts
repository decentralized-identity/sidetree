import { PsuedoRandomBitStream, PsuedoRandomGenerator, ReservoirSampler } from '../../lib/bitcoin/PsuedoRandomSampler';

describe('PsuedoRandomBitStream', () => {
  it('should produce deterministic bit stream', () => {
    const psuedoRandomBitStream1 = new PsuedoRandomBitStream('hello world');
    const psuedoRandomBitStream2 = new PsuedoRandomBitStream('hello world');

    for (let i = 0 ; i < 1024 ; ++i) {
      const bit1 = psuedoRandomBitStream1.getNextBit();
      const bit2 = psuedoRandomBitStream2.getNextBit();
      expect(bit1).toEqual(bit2);
    }
  });

  // sanity check for randomness
  it('should produce 0s and 1s with equi-probability', () => {
    const psuedoRandomBitStream = new PsuedoRandomBitStream('hello world');
    let zeroCount = 0;
    let oneCount = 0;
    for (let i = 0 ; i < 1024 ; ++i) {
      const bit = psuedoRandomBitStream.getNextBit();
      if (bit === 0) {
        zeroCount++;
      } else if (bit === 1) {
        oneCount++;
      } else {
        fail('Invalid output produced by psuedoRandomBitStream');
      }
    }

    expect(zeroCount).toBeGreaterThan(450);
    expect(oneCount).toBeGreaterThan(450);
  });
});

describe('PsuedoRandomGenerator', () => {
  it('should generate bernoulli sample with expected probability', () => {
    const psuedoRandomGenerator = new PsuedoRandomGenerator(new PsuedoRandomBitStream('hello world'));
    let oneCount = 0;

    for (let i = 0 ; i < 3000 ; ++i) {
      const bit = psuedoRandomGenerator.getBernoulliSample(1,3);
      if (bit === 1) {
        oneCount++;
      }
    }
    // expected: 1/3 x 3000 == 1000
    expect(oneCount).toBeGreaterThan(900);
    expect(oneCount).toBeLessThan(1100);

    oneCount = 0;
    for (let i = 0 ; i < 2000 ; ++i) {
      const bit = psuedoRandomGenerator.getBernoulliSample(1,2);
      if (bit === 1) {
        oneCount++;
      }
    }
    // expected: 1/2 x 2000 === 1000
    expect(oneCount).toBeGreaterThan(900);
    expect(oneCount).toBeLessThan(1100);

    oneCount = 0;
    for (let i = 0 ; i < 1000 ; ++i) {
      const bit = psuedoRandomGenerator.getBernoulliSample(1,1);
      if (bit === 1) {
        oneCount++;
      }
    }
    // expected: 1/1 x 1000 === 1000
    expect(oneCount).toEqual(1000);
  });

  it('should generate deterministic bernoulli samples with same seed', () => {
    const psuedoRandomGenerator1 = new PsuedoRandomGenerator(new PsuedoRandomBitStream('hello world'));
    const psuedoRandomGenerator2 = new PsuedoRandomGenerator(new PsuedoRandomBitStream('hello world'));

    for (let i = 0 ; i < 3000 ; ++i) {
      const bit1 = psuedoRandomGenerator1.getBernoulliSample(1,3);
      const bit2 = psuedoRandomGenerator2.getBernoulliSample(1,3);
      expect(bit1).toEqual(bit2);
    }

    for (let i = 0 ; i < 2000 ; ++i) {
      const bit1 = psuedoRandomGenerator1.getBernoulliSample(1,2);
      const bit2 = psuedoRandomGenerator2.getBernoulliSample(1,2);
      expect(bit1).toEqual(bit2);
    }
  });

  it('should generate uniform random samples', () => {
    const psuedoRandomGenerator = new PsuedoRandomGenerator(new PsuedoRandomBitStream('hello world'));
    const maxValue = 10;
    const sampleCount: number[] = new Array(maxValue).fill(0);

    for (let i = 0 ; i < 10000 ; ++i) {
      const sample = psuedoRandomGenerator.getRandomNumber(maxValue);
      expect(sample).toBeLessThan(maxValue);
      expect(sample).toBeGreaterThanOrEqual(0);
      sampleCount[sample]++;
    }

    const maxSampleCount = Math.max(...sampleCount);
    const minSampleCount = Math.min(...sampleCount);
    expect(minSampleCount).toBeGreaterThan(900);
    expect(maxSampleCount).toBeLessThan(1100);
  });
});

describe('ReservoirSampler', () => {
  it('should sample uniformly with sample size 1', () => {
    const reservoirSampler = new ReservoirSampler(1);
    reservoirSampler.resetPsuedoRandomSeed('hello world');
    const maxValue = 10;
    const sampleCount: number[] = new Array(maxValue).fill(0);

    for (let i = 0 ; i < 10000 ; ++i) {
      reservoirSampler.clear();
      for (let j = 0 ; j < maxValue ; ++j) {
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

    for (let i = 0 ; i < sampleSize ; ++i) {
      reservoirSampler.addElement(i.toString());
    }

    const sample = reservoirSampler.getSample();
    expect(sample.length).toBe(sampleSize);
    for (let i = 0 ; i < sampleSize ; ++i) {
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

    for (let i = 0 ; i < 10000 ; ++i) {
      reservoirSampler.clear();
      for (let j = 0 ; j < maxValue ; ++j) {
        reservoirSampler.addElement(j.toString());
      }

      const sample = reservoirSampler.getSample();
      expect(sample.length).toBe(sampleSize);

      const missingInteger = (sampleSize * maxValue) / 2 - sample.map(s => parseInt(s, 10)).reduce((a,b) => a + b, 0);
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

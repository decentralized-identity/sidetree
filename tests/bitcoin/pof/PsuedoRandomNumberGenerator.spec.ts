import PsuedoRandomBitStream from '../../../lib/bitcoin/fee/PsuedoRandomBitStream';
import PsuedoRandomNumberGenerator from '../../../lib/bitcoin/fee/PsuedoRandomNumberGenerator';

describe('PsuedoRandomNumberGenerator', () => {

  it('should generate uniform random samples', () => {
    const psuedoRandomGenerator = new PsuedoRandomNumberGenerator(new PsuedoRandomBitStream('hello world'));
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

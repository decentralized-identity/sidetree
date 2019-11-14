import ValueApproximator from '../../../lib/bitcoin/pof/ValueApproximator';

describe('Value approximator', () => {
  const approximation = 2;
  const maxValue = 1024;
  const valueApproximator = new ValueApproximator(approximation, maxValue);

  it('should normalize/denormalize with approximation guarantees', () => {
    for (let i = 0 ; i < maxValue ; i++) {
      const normalizedValue = valueApproximator.getNormalizedValue(i);
      const denormalizedValue = valueApproximator.getDenormalizedValue(normalizedValue);

      expect(denormalizedValue).toBeGreaterThanOrEqual(i);
      expect(denormalizedValue).toBeLessThan(Math.max(1, i * 2));
    }
  });

  it('should normalize values to a compact range', () => {
    for (let i = 0 ; i < maxValue ; i++) {
      const normalizedValue = valueApproximator.getNormalizedValue(i);
      expect(normalizedValue).toBeGreaterThanOrEqual(0);
      expect(normalizedValue).toBeLessThanOrEqual(11);
    }
  });

  it('should normalize negative and large values to a compact range', () => {
    let normalizedValue = valueApproximator.getNormalizedValue(-1);
    expect(normalizedValue).toBe(0);
    normalizedValue = valueApproximator.getNormalizedValue(2048);
    expect(normalizedValue).toBe(11);
  });
});

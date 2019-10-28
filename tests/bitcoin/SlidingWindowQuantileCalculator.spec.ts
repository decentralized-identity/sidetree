import { runLengthEncode, runLengthDecode, ValueApproximator } from '../../lib/bitcoin/SlidingWindowQuantileCalculator';

function checkArrayEqual (array1: number[], array2: number[]): boolean {
  if (array1.length !== array2.length) {
    return false;
  }

  for (let i = 0 ; i < array1.length ; ++i) {
    if (array1[i] !== array2[i]) {
      return false;
    }
  }

  return true;
}

describe('Run length encoding', () => {
  it('should encode array with one distinct element correctly', () => {
    const arraySize = 100;
    const elem = 1;
    const array = new Array<number>(arraySize).fill(elem);
    const encodedArray = runLengthEncode(array);
    expect(encodedArray.length).toBe(2);
    expect(encodedArray[0]).toBe(elem);
    expect(encodedArray[1]).toBe(arraySize);
    expect(checkArrayEqual(array, runLengthDecode(encodedArray))).toBe(true);
  });

  it('should encode array with no duplicate elements correctly', () => {
    const arraySize = 100;
    const array = new Array<number>();
    for (let i = 0 ; i < arraySize ; ++i) {
      array.push(i);
    }
    const encodedArray = runLengthEncode(array);
    const decodedArray = runLengthDecode(encodedArray);
    expect(checkArrayEqual(array, decodedArray)).toBe(true);
    expect(encodedArray.length).toBe(2 * arraySize);

    const frequencies = encodedArray.filter((_value, index) => (index % 2 === 1));
    expect(frequencies.every(v => (v === 1))).toBe(true);
  });

  it('should encode/decode test arrays correctly', () => {
    const testArrays = [ [1, 1, 2, 2, 3], [1, 1, 2, 1, 1], [1, 2, 1, 2, 1, 2]];

    for (let array of testArrays) {
      const encodedArray = runLengthEncode(array);
      const decodedArray = runLengthDecode(encodedArray);
      expect(checkArrayEqual(array, decodedArray)).toBe(true);
    }
  });
});

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

import RunLengthTransformer from '../../../lib/bitcoin/fee/RunLengthTransformer';

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
    const encodedArray = RunLengthTransformer.encode(array);
    expect(encodedArray.length).toBe(2);
    expect(encodedArray[0]).toBe(elem);
    expect(encodedArray[1]).toBe(arraySize);
    expect(checkArrayEqual(array, RunLengthTransformer.decode(encodedArray))).toBe(true);
  });

  it('should encode array with no duplicate elements correctly', () => {
    const arraySize = 100;
    const array = new Array<number>();
    for (let i = 0 ; i < arraySize ; ++i) {
      array.push(i);
    }
    const encodedArray = RunLengthTransformer.encode(array);
    const decodedArray = RunLengthTransformer.decode(encodedArray);
    expect(checkArrayEqual(array, decodedArray)).toBe(true);
    expect(encodedArray.length).toBe(2 * arraySize);

    const frequencies = encodedArray.filter((_value, index) => (index % 2 === 1));
    expect(frequencies.every(v => (v === 1))).toBe(true);
  });

  it('should encode/decode test arrays correctly', () => {
    const testArrays = [ [1, 1, 2, 2, 3], [1, 1, 2, 1, 1], [1, 2, 1, 2, 1, 2]];

    for (let array of testArrays) {
      const encodedArray = RunLengthTransformer.encode(array);
      const decodedArray = RunLengthTransformer.decode(encodedArray);
      expect(checkArrayEqual(array, decodedArray)).toBe(true);
    }
  });
});

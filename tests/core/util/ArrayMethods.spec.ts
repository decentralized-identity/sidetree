import ArrayMethods from '../../../lib/core/versions/latest/util/ArrayMethods';

describe('ArrayMethods', () => {
  describe('hasDuplicates', () => {
    it('should return true if there are duplicates', () => {
      const result = ArrayMethods.hasDuplicates([1, 1]);
      expect(result).toBeTruthy();
    });

    it('should return false if there are no duplciates', () => {
      const result = ArrayMethods.hasDuplicates([1, 2]);
      expect(result).toBeFalsy();
    });
  });

  describe('areMutuallyExclusive', () => {
    it('should return true if arrays are mutually exclusive', () => {
      const result = ArrayMethods.areMutuallyExclusive([1, 1, 2, 2, 3, 3, 4, 4], [5, 5, 6, 5, 7, 7, 8, 8]);
      expect(result).toBeTruthy();
    });

    it('should return false if arrays are not mutually exclusive', () => {
      const result = ArrayMethods.areMutuallyExclusive([1, 1, 2, 2, 3, 3, 4, 4], [5, 5, 6, 5, 7, 7, 8, 8, 1]);
      expect(result).toBeFalsy();
    });
  });
});

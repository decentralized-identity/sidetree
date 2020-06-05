/**
 * Class containing reusable sorted array operations.
 */
export default class SortedArray {
  /**
   * Performs binary search on an item against the given sorted array using the given compare function.
   * @returns Returns the index of the item if found; `undefined` otherwise.
   */
  public static binarySearch<T1, T2> (sortedArray: Array<T1>, searchItem: T2, compare: (item1: T1, item2: T2) => number): number | undefined {
    let lowerBoundaryIndex = 0;
    let upperBoundaryIndex = sortedArray.length - 1;
    let middleIndex = 0;
    while (lowerBoundaryIndex <= upperBoundaryIndex) {
      middleIndex = Math.floor((lowerBoundaryIndex + upperBoundaryIndex) / 2);

      const comparisonResult = compare(sortedArray[middleIndex], searchItem);
      if (comparisonResult > 0) {
        // If value pointed by middleIndex is greater than the searchItem:
        upperBoundaryIndex = middleIndex - 1;
      } else if (comparisonResult < 0) {
        // If value pointed by middleIndex is smaller than the searchItem:
        lowerBoundaryIndex = middleIndex + 1;
      } else {
        // Else we've found the item.
        return middleIndex;
      }
    }

    return undefined;
  }
}

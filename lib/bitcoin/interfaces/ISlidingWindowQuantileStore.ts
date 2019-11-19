import QuantileInfo from '../models/QuantileInfo';

/**
 * Interface to store quantile state in a store such
 * as mongo. Having a separate interface helps with
 * tests using mock implementations.
 */
export default interface ISlidingWindowQuantileStore {

  /** Initialize the store */
  initialize (): Promise<void>;

  /**
   * Retrieve the quantile info for a given groupId
   */
  get (groupId: number): Promise<QuantileInfo | undefined>;

  /**
   * Store the quantile info for a new group.
   */
  put (quantileInfo: QuantileInfo): Promise<void>;

  /**
   * Clear all stored state in the quantile store.
   */
  clear (): Promise<void>;

  /**
   * Get the last groupId stored in the collection.
   */
  getLastGroupId (): Promise<number | undefined>;

  /**
   * Get the first groupId stored in the collection
   */
  getFirstGroupId (): Promise<number | undefined>;

  /**
   * Remove groups with ids greater than or equal to a specified groupId
   */
  removeGroupsGreaterThanEqualTo (groupId: number): Promise<void>;
}

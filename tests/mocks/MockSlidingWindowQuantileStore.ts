import ISlidingWindowQuantileStore from '../../lib/bitcoin/pof/interfaces/ISlidingWindowQuantileStore';
import QuantileInfo from '../../lib/bitcoin/pof/models/QuantileInfo';

export default class MockSlidingWindowQuantileStore implements ISlidingWindowQuantileStore {

  private groupIdToQuantileInfo: Map<number, QuantileInfo> = new Map();

  /** Initialize the store */
  public async initialize (): Promise<void> {
    return;
  }

  /**
   * Retrieve the quantile info for a given groupId
   */
  public async get (groupId: number): Promise<QuantileInfo | undefined> {
    return this.groupIdToQuantileInfo.get(groupId);
  }

  /**
   * Store the quantile info for a new group.
   */
  public async put (quantileInfo: QuantileInfo): Promise<void> {
    this.groupIdToQuantileInfo.set(quantileInfo.groupId, quantileInfo);
  }

  /**
   * Clear all stored state in the quantile store.
   */
  public async clear (): Promise<void> {
    this.groupIdToQuantileInfo.clear();
  }

  /**
   * Get the last groupId stored in the collection.
   */
  public async getLastGroupId (): Promise<number | undefined> {
    let lastGroupId: number | undefined = undefined;
    for (let groupId of this.groupIdToQuantileInfo.keys()) {
      // Note: if (lastGroupId) does not work, since 0 translates to false
      if (lastGroupId !== undefined) {
        if (lastGroupId < groupId) {
          lastGroupId = groupId;
        }
      } else {
        lastGroupId = groupId;
      }
    }

    return lastGroupId;
  }

  /**
   * Get the first groupId stored in the collection
   */
  public async getFirstGroupId (): Promise<number | undefined> {
    let firstGroupId: number | undefined = undefined;

    for (let groupId of this.groupIdToQuantileInfo.keys()) {
      // Note: if (firstGroupId) does not work, since 0 translates to false
      if (firstGroupId !== undefined) {
        if (firstGroupId > groupId) {
          firstGroupId = groupId;
        }
      } else {
        firstGroupId = groupId;
      }
    }

    return firstGroupId;
  }

  /**
   * Remove groups with ids greater than or equal to a specified groupId
   */
  public async removeGroupsGreaterThanEqualTo (groupIdLimit: number): Promise<void> {
    let groupIdsToRemove = new Array<number>();

    for (let groupId of this.groupIdToQuantileInfo.keys()) {
      if (groupId >= groupIdLimit) {
        groupIdsToRemove.push(groupId);
      }
    }

    for (let groupId of groupIdsToRemove) {
      this.groupIdToQuantileInfo.delete(groupId);
    }
  }
}

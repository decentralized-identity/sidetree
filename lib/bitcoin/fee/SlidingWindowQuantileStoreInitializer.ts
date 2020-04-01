import ISlidingWindowQuantileStore from '../interfaces/ISlidingWindowQuantileStore';
import ProtocolParameters from '../ProtocolParameters';
import RunLengthTransformer from './RunLengthTransformer';
import QuantileInfo from '../models/QuantileInfo';

/**
 * We want to insert some static data in the quantile db to bootstrap the calculation. This class
 * encapsulates the functionality to do that.
 */
export default class SlidingWindowQuantileStoreInitializer {

  private constructor (
    private genesisBlockNumber: number,
    private groupSizeInBlocks: number,
    private windowSizeInGroup: number,
    private sampleSizePerGroup: number,
    private initialQuantileValue: number,
    private mongoDbStore: ISlidingWindowQuantileStore) {
  }

  /**
   * Initializes the database if it is empty.
   *
   * @param genesisBlockNumber The genesis block.
   * @param mongoDbStore The data store.
   */
  public static async initializeDatabaseIfEmpty (
    genesisBlockNumber: number,
    mongoDbStore: ISlidingWindowQuantileStore) {

    // The quantile value below is what we have decided to be the value for the initial
    // static value. Since this value is normalized, we'll use the approximator to get
    // the original value.
    const initialQuantileValue = 25000;

    const dataInitializer = SlidingWindowQuantileStoreInitializer.createInstance(
      genesisBlockNumber,
      initialQuantileValue,
      mongoDbStore);

    await dataInitializer.addDataIfNecessary();
  }

  private static createInstance (
    genesisBlockNumber: number,
    initialQuantileValue: number,
    mongoDbStore: ISlidingWindowQuantileStore) {

    return new SlidingWindowQuantileStoreInitializer(
        genesisBlockNumber,
        ProtocolParameters.groupSizeInBlocks,
        ProtocolParameters.windowSizeInGroups,
        ProtocolParameters.sampleSizePerGroup,
        initialQuantileValue,
        mongoDbStore);
  }

  private async addDataIfNecessary (): Promise<boolean> {
    const dbIsEmpty = (await this.mongoDbStore.getFirstGroupId()) === undefined;

    if (!dbIsEmpty) {
      console.info(`The sliding window quantile store is not empty. Skipping data initialization.`);
      return false;
    }

    console.info(`The sliding window quantile store is empty. Starting data initialization.`);

    // Figure out how far in the past do we need to go.
    //  - If the genesis block is in block: X then the end-group is `block-gensis - 1`. The
    //    genesis block will be processed normally and its group will be entered normally.
    const endGroupId = Math.floor(this.genesisBlockNumber / this.groupSizeInBlocks) - 1;

    //  - Start is going back full window size (-2 === go a little further back just to be safe)
    let startGroupId = endGroupId - this.windowSizeInGroup - 2;

    await this.insertValuesInStore(startGroupId, endGroupId);

    return true;
  }

  private async insertValuesInStore (startGroupId: number, endGroupId: number): Promise<void> {

    // Mock that all of the transactions sampled have the same value for quantile.
    const frequencyVector = new Array<number>(this.sampleSizePerGroup);
    frequencyVector.fill(this.initialQuantileValue);

    // Get the value to be actually saved in the DB.
    const encodedFrequencyVector = RunLengthTransformer.encode(frequencyVector);

    // Now insert the values
    while (startGroupId <= endGroupId) {

      const quantileInfo: QuantileInfo = {
        groupId: startGroupId,
        quantile: this.initialQuantileValue,
        groupFreqVector: encodedFrequencyVector
      };

      await this.mongoDbStore.put(quantileInfo);
      startGroupId++;
    }
  }
}

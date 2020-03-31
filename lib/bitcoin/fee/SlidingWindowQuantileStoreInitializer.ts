import ISlidingWindowQuantileStore from '../interfaces/ISlidingWindowQuantileStore';
import ProtocolParameters from '../ProtocolParameters';
import RunLengthTransformer from './RunLengthTransformer';
import QuantileInfo from '../models/QuantileInfo';
import ValueApproximator from './ValueApproximator';

/**
 * We want to insert some static data in the quantile db to bootstrap the calculation. This class
 * encapsulates the functionality to do that.
 */
export default class SlidingWindowQuantileStoreInitializer {

  private constructor (
    private genesisBlockNumber: number,
    private groupSizeInBlocks: number,
    private slidingWindowSizeInGroups: number,
    private sampleSize: number,
    private initialQuantileValue: number,
    private valueApproximator: ValueApproximator,
    private slidingWindowQuantileStore: ISlidingWindowQuantileStore) {
  }

  /**
   * Initializes the database if it is empty.
   *
   * @param genesisBlockNumber The genesis block.
   * @param valueApproximator The value approximator.
   * @param slidingWindowQuantileStore The data store.
   */
  public static async initializeDatabaseIfEmpty (
    genesisBlockNumber: number,
    valueApproximator: ValueApproximator,
    slidingWindowQuantileStore: ISlidingWindowQuantileStore) {

    const initialQuantileValue = 25000;

    const dataInitializer = new SlidingWindowQuantileStoreInitializer(
      genesisBlockNumber,
      ProtocolParameters.groupSizeInBlocks,
      ProtocolParameters.windowSizeInGroups,
      ProtocolParameters.sampleSizePerGroup,
      initialQuantileValue,
      valueApproximator,
      slidingWindowQuantileStore);

    await dataInitializer.addDataIfNecessary();
  }

  private async addDataIfNecessary (): Promise<boolean> {
    const dbIsNotEmpty = (await this.slidingWindowQuantileStore.getFirstGroupId()) !== undefined;

    if (dbIsNotEmpty) {
      console.info(`The sliding window quantile store is not empty. Skipping data initialization.`);
      return false;
    }

    console.info(`The sliding window quantile store is empty. Starting data initialization.`);

    // Figure out how far in the past do we need to go.
    //  - The end is the group is just before the group represented by the genesis block. The
    //    genesis block will be processed normally and it's group will be entered normally.
    const endGroupId = Math.floor(this.genesisBlockNumber / this.groupSizeInBlocks) - 1;

    //  - Start is full window size (-2 === go a little further back just to be safe)
    let startGroupId = endGroupId - this.slidingWindowSizeInGroups - 2;

    await this.insertValuesInStore(startGroupId, endGroupId);
    return true;
  }

  private async insertValuesInStore (startGroupId: number, endGroupId: number): Promise<void> {

    const normalizedQuantile = this.valueApproximator.getNormalizedValue(this.initialQuantileValue);

    // Mock that all of the transactions sampled have the same value for quantile.
    const frequencyVector = new Array<number>(this.sampleSize);
    frequencyVector.fill(normalizedQuantile);

    const encodedFrequencyVector = RunLengthTransformer.encode(frequencyVector);

    // Now insert the values in the quantile DB
    while (startGroupId <= endGroupId) {

      const quantileInfo: QuantileInfo = {
        groupId: startGroupId,
        quantile: normalizedQuantile,
        groupFreqVector: encodedFrequencyVector
      };

      await this.slidingWindowQuantileStore.put(quantileInfo);
      startGroupId++;
    }
  }
}

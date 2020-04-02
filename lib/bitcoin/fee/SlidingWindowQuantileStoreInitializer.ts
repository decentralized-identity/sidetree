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
    valueApproximator: ValueApproximator,
    mongoDbStore: ISlidingWindowQuantileStore) {

    // The quantile value below is what we have decided to be the value for the initial
    // static value.
    const quantile = 25000;
    const normalizedQuantile = valueApproximator.getNormalizedValue(quantile);

    const dataInitializer = SlidingWindowQuantileStoreInitializer.createInstance(
      genesisBlockNumber,
      normalizedQuantile,
      mongoDbStore);

    await dataInitializer.addDataIfNecessary();
  }

  /**
   * Creates an instance of this object. This function is really created to help with unit testing.
   * The output of this function can be mocked to test the callers.
   *
   * @param genesisBlockNumber The genesis block
   * @param initialQuantileValue Initial quantile value to use.
   * @param mongoDbStore The quantile db store.
   */
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

    // Figure out how far in the past do we need to go.
    //  - If the genesis block belongs to group: X then the end-group is `X - 1`. The
    //    genesis block will be processed normally and its group will be entered normally.
    const groupOfGenesisBlock = Math.floor(this.genesisBlockNumber / this.groupSizeInBlocks);
    const endGroupId = groupOfGenesisBlock - 1;

    //  - Start is going back at least full window size (-2 === go a little further back just to be safe)
    let startGroupId = endGroupId - this.windowSizeInGroup - 2;

    console.info(`Genesis block: ${this.genesisBlockNumber}; Initialization start group: ${startGroupId}; Initialization end group: ${endGroupId}`);

    if ((await this.isDataInsertionRequired(startGroupId, endGroupId))) {

      console.info(`Starting data initialization.`);
      await this.insertValuesInDb(startGroupId, endGroupId);

      return true;
    }

    return false;
  }

  private async insertValuesInDb (startGroupId: number, endGroupId: number): Promise<void> {

    // Mock that all of the transactions sampled have the same value for quantile.
    const frequencyVector = new Array<number>(this.sampleSizePerGroup);
    frequencyVector.fill(this.initialQuantileValue);

    // Get the value to be actually saved in the DB.
    const encodedFrequencyVector = RunLengthTransformer.encode(frequencyVector);

    console.info(`Inserting Quantile: ${this.initialQuantileValue}; Frequency vector: ${encodedFrequencyVector}`);

    // Now insert the values
    for (let currentGroupId = startGroupId; currentGroupId <= endGroupId; currentGroupId++) {

      const quantileInfo: QuantileInfo = {
        groupId: currentGroupId,
        quantile: this.initialQuantileValue,
        groupFreqVector: encodedFrequencyVector
      };

      await this.mongoDbStore.put(quantileInfo);
    }
  }

  private async isDataInsertionRequired (startGroupId: number, endGroupId: number): Promise<boolean> {
    const firstGroupIdInDb = await this.mongoDbStore.getFirstGroupId();

    if (!firstGroupIdInDb) {
      console.info(`The sliding window quantile store is empty; need to insert the initialization data.`);
      return true;
    }

    const lastGroupIdInDb = await this.mongoDbStore.getLastGroupId();

    console.info(`Start group in Db: ${firstGroupIdInDb}. End group in Db: ${lastGroupIdInDb}`);

    const dbDataIsCorrect = (firstGroupIdInDb === startGroupId) && (lastGroupIdInDb! >= endGroupId);

    if (!dbDataIsCorrect) {
      // Partial data is present (maybe the node crashed during initialization). Just
      // delete everything and start over.
      console.info(`Deleting everything in the quantile Db.`);

      await this.mongoDbStore.clear();
      return true;
    }

    console.info(`Quantile db is in correct state; no need to insert any data.`);
    return false;
  }
}

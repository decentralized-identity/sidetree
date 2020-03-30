import ISlidingWindowQuantileStore from '../interfaces/ISlidingWindowQuantileStore';
import RunLengthTransformer from './RunLengthTransformer';
import ValueApproximator from './ValueApproximator';
import QuantileInfo from '../models/QuantileInfo';

export default class SlidingWindowQuantileCalculatorDataInitializer {

  public constructor (
    private genesisBlockNumber: number,
    private groupSizeInBlocks: number,
    private slidingWindowSizeInGroups: number,
    private sampleSize: number,
    private initialQuantileValue: number,
    private valueApproximator: ValueApproximator,
    private slidingWindowQuantileStore: ISlidingWindowQuantileStore) {
  }

  public async addDataIfNecessary (): Promise<boolean> {
    if (!(await this.isDbEmpty())) {
      return false;
    }

    const approximatedQuantile = this.valueApproximator.getNormalizedValue(this.initialQuantileValue);

    const frequencyVector = new Array<number>(this.sampleSize);
    frequencyVector.fill(approximatedQuantile);

    const encodedFrequencyVector = RunLengthTransformer.encode(frequencyVector);
    const endGroupId = Math.floor(this.genesisBlockNumber / this.groupSizeInBlocks);
    let startGroupId = endGroupId - this.slidingWindowSizeInGroups - 1;

    while (startGroupId <= endGroupId) {
      const quantileInfo: QuantileInfo = {
        groupId: startGroupId,
        quantile: this.initialQuantileValue,
        groupFreqVector: encodedFrequencyVector
      };

      await this.slidingWindowQuantileStore.put(quantileInfo);
      startGroupId++;
    }
  }

  private async isDbEmpty (): Promise<boolean> {
    return (await this.slidingWindowQuantileStore.getFirstGroupId()) !== undefined;
  }
}

import BlockMetadata from '../../models/BlockMetadata';
import BlockMetadataWithoutNormalizedFee from '../../models/BlockMetadataWithoutNormalizedFee';
import IFeeCalculator from '../../interfaces/IFeeCalculator';

/**
 * `IFeeCalculator` implementation.
 */
export default class NormalizedFeeCalculator implements IFeeCalculator {

  private fee: number = 10;

  /**
   * Initializes the Bitcoin processor.
   */
  public async initialize () {
    console.log(`Initializing normalized fee calculator.`);
  }

  public async getNormalizedFee (_block: number): Promise<number> {
    // TODO: Issue #783 - Simplify normalized fee calculation algorithm.
    return this.fee;
  }

  public async addNormalizedFeeToBlock (blockMetadataWithoutFee: BlockMetadataWithoutNormalizedFee): Promise<BlockMetadata> {
    return Object.assign({ normalizedFee: this.fee }, blockMetadataWithoutFee);
  }
}

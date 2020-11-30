import BitcoinErrorCode from './ErrorCode';
import BitcoinVersionModel from './models/BitcoinVersionModel';
import IBitcoinConfig from './IBitcoinConfig';
import IBlockMetadataStore from './interfaces/IBlockMetadataStore';
import IFeeCalculator from './interfaces/IFeeCalculator';
import ProtocolParameters from './models/ProtocolParameters';
import SidetreeError from '../common/SidetreeError';

/**
 * The class that handles code versioning.
 */
export default class VersionManager {
  // Reverse sorted implementation versions. ie. latest version first.
  private versionsReverseSorted: BitcoinVersionModel[];

  private feeCalculators: Map<string, IFeeCalculator>;
  private protocolParameters: Map<string, ProtocolParameters>;

  public constructor () {
    this.versionsReverseSorted = [];
    this.feeCalculators = new Map();
    this.protocolParameters = new Map();
  }

  /**
   * Loads all the implementation versions.
   */
  public async initialize (
    versions: BitcoinVersionModel[],
    config: IBitcoinConfig,
    blockMetadataStore: IBlockMetadataStore
  ) {
    // Reverse sort versions.
    this.versionsReverseSorted = versions.sort((a, b) => b.startingBlockchainTime - a.startingBlockchainTime);
    // NOTE: In principal each version of the interface implementations can have different constructors,
    // but we currently keep the constructor signature the same as much as possible for simple instance construction,
    // but it is not inherently "bad" if we have to have conditional constructions for each if we have to.
    for (const versionModel of this.versionsReverseSorted) {
      const version = versionModel.version;
      this.protocolParameters.set(version, versionModel.protocolParameters);

      const initialNormalizedFeeInSatoshis = versionModel.protocolParameters.initialNormalizedFeeInSatoshis;
      const feeLookBackWindowInBlocks = versionModel.protocolParameters.feeLookBackWindowInBlocks;
      const feeMaxFluctuationMultiplierPerBlock = versionModel.protocolParameters.feeMaxFluctuationMultiplierPerBlock;

      const FeeCalculator = await this.loadDefaultExportsForVersion(version, 'NormalizedFeeCalculator');
      const feeCalculator = new FeeCalculator(
        blockMetadataStore,
        config.genesisBlockNumber,
        initialNormalizedFeeInSatoshis,
        feeLookBackWindowInBlocks,
        feeMaxFluctuationMultiplierPerBlock
      );
      this.feeCalculators.set(version, feeCalculator);
    }
  }

  /**
   * Gets the corresponding version of the `IFeeCalculator` based on the given block height.
   */
  public getFeeCalculator (blockHeight: number): IFeeCalculator {
    const version = this.getVersionString(blockHeight);
    const feeCalculator = this.feeCalculators.get(version)!;
    return feeCalculator;
  }

  /**
   * Gets the corresponding version of the lock duration based on the given block height.
   */
  public getLockDurationInBlocks (blockHeight: number): number {
    const version = this.getVersionString(blockHeight);
    const protocolParameter = this.protocolParameters.get(version)!;
    return protocolParameter.valueTimeLockDurationInBlocks;
  }

  /**
   * Gets the corresponding implementation version string given the blockchain time.
   */
  private getVersionString (blockHeight: number): string {
    // Iterate through each version to find the right version.
    for (const versionModel of this.versionsReverseSorted) {
      if (blockHeight >= versionModel.startingBlockchainTime) {
        return versionModel.version;
      }
    }

    throw new SidetreeError(BitcoinErrorCode.VersionManagerVersionStringNotFound, `Unable to find version string for block ${blockHeight}.`);
  }

  private async loadDefaultExportsForVersion (version: string, className: string): Promise<any> {
    const defaults = (await import(`./versions/${version}/${className}`)).default;

    return defaults;
  }
}

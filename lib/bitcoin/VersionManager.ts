import BitcoinErrorCode from './ErrorCode';
import IFeeCalculator from './interfaces/IFeeCalculator';
import SidetreeError from '../common/SidetreeError';
import VersionModel from '../common/models/VersionModel';

/**
 * The class that handles code versioning.
 */
export default class VersionManager {
  // Reverse sorted implementation versions. ie. latest version first.
  private versionsReverseSorted: VersionModel[];

  private feeCalculators: Map<string, IFeeCalculator>;

  public constructor (versions: VersionModel[]) {
    // Reverse sort versions.
    this.versionsReverseSorted = versions.sort((a, b) => b.startingBlockchainTime - a.startingBlockchainTime);

    this.feeCalculators = new Map();
  }

  /**
   * Loads all the implementation versions.
   */
  public async initialize () {
    // NOTE: In principal each version of the interface implementations can have different constructors,
    // but we currently keep the constructor signature the same as much as possible for simple instance construction,
    // but it is not inherently "bad" if we have to have conditional constructions for each if we have to.
    for (const versionModel of this.versionsReverseSorted) {
      const version = versionModel.version;

      /* tslint:disable-next-line */
      const FeeCalculator = await this.loadDefaultExportsForVersion(version, 'NormalizedFeeCalculator');
      const feeCalculator = new FeeCalculator();
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

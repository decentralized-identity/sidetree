import AbstractVersionMetadata from '../abstracts/AbstractVersionMetadata';

/**
 * An interface that helps versioned code access metadata from other versions
 */
export default interface IVersionMetadataFetcher {
  /**
   * Given a blockchain time, returns the metadata for it.
   * @param blockchainTime the transaction time to get metadata for
   */
  getVersionMetadata (blockchainTime: number): AbstractVersionMetadata;
}

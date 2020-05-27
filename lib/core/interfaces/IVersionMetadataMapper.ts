import AbstractVersionMetadata from '../AbstractVersionMetadata';

/**
 * An interface that helps versioned code access metadata from other versions
 */
export default interface IVersionMetadataMapper {
  /**
   * Given a blockchain time, returns the metadata for it.
   * @param blockchainTime the transaction time to get metadata for
   */
  getVersionMetadataByTransactionTime (blockchainTime: number): AbstractVersionMetadata;
}

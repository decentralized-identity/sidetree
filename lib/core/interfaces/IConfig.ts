/**
 * Defines all the configuration parameters needed to initialize Sidetree Core.
 */
export default interface IConfig {
  batchingIntervalInSeconds: number;
  blockchainServiceUri: string;
  contentAddressableStoreServiceUri: string;
  didMethodName: string;
  maxConcurrentDownloads: number;
  observingIntervalInSeconds: number;
  mongoDbConnectionString: string;
}

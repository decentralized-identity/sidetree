/**
 * Defines all the configuration parameters needed to initialize Sidetree Core.
 */
export default interface Config {
  batchingIntervalInSeconds: number;
  blockchainServiceUri: string;
  databaseName: string;
  didMethodName: string;
  maxConcurrentDownloads: number;
  mongoDbConnectionString: string;
  observingIntervalInSeconds: number;
}

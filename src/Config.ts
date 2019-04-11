/**
 * Defines all the configuration parameters needed to initialize Sidetree Core.
 */
export interface IConfig {
  batchingIntervalInSeconds: number;
  blockchainServiceUri: string;
  casServiceUri: string;
  didMethodName: string;
  maxConcurrentCasDownloads: number;
  observingIntervalInSeconds: number;
  operationStoreUri: string;
}

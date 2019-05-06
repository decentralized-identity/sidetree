/**
 * Defines all the configuration parameters needed to initialize Sidetree blockchain service.
 */
export interface IConfig {
  bitcoreSidetreeServiceUri: string;
  sidetreeTransactionPrefix: string;
  bitcoinSidetreeGenesisBlockNumber: number;
  bitcoinSidetreeGenesisBlockHash: string;
  bitcoinPollingInternalSeconds: number;
  databaseName: string | undefined;
  maxSidetreeTransactions: number;
  mongoDbConnectionString: string;
}

/**
 * Defines all the configuration parameters needed to initialize Sidetree bitcoin service.
 */
export interface IBitcoinConfig {
  bitcoreSidetreeServiceUri: string;
  sidetreeTransactionPrefix: string;
  bitcoinSidetreeGenesisBlockNumber: number;
  bitcoinSidetreeGenesisBlockHash: string;
  bitcoinPollingInternalSeconds: number;
  databaseName: string | undefined;
  maxSidetreeTransactions: number;
  mongoDbConnectionString: string;
}

/**
 * Defines all the configuration parameters needed to initialize Sidetree bitcoin service.
 */
export interface IBitcoinConfig {
  bitcoreExtensionUri: string;
  sidetreeTransactionPrefix: string;
  genesisBlockNumber: number;
  genesisBlockHash: string;
  pollingInternalInSeconds: number;
  databaseName: string | undefined;
  maxSidetreeTransactions: number;
  mongoDbConnectionString: string;
}

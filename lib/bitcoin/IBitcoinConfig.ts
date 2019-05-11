/**
 * Defines all the configuration parameters needed to initialize Sidetree bitcoin service.
 */
export interface IBitcoinConfig {
  bitcoinExtensionUri: string;
  bitcoinWalletImportString: string;
  bitcoinFee: number;
  sidetreeTransactionPrefix: string;
  genesisBlockNumber: number;
  genesisBlockHash: string;
  mongoDbConnectionString: string;
  databaseName: string | undefined;
  maxSidetreeTransactions: number;
}

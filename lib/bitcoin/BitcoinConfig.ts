/**
 * Defines all the configuration parameters needed to initialize Sidetree bitcoin service.
 */
export interface IBitcoinConfig {
  bitcoreSidetreeServiceUri: string;
  bitcoreBlockchain: 'BTC' | 'BCH' | 'ETH' | 'BAT' | undefined;
  bitcoreNetwork: string | undefined;
  sidetreeTransactionPrefix: string;
  bitcoinSidetreeGenesisBlockNumber: number;
  bitcoinSidetreeGenesisBlockHash: string;
  bitcoinPollingInternalSeconds: number;
  databaseName: string | undefined;
  maxSidetreeTransactions: number;
  mongoDbConnectionString: string;
}

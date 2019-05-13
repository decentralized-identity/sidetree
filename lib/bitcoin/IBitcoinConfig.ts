/**
 * Defines all the configuration parameters needed to initialize Sidetree bitcoin service.
 */
export interface IBitcoinConfig {
  bitcoinExtensionUri: string;
  bitcoinWalletImportString: string;
  bitcoinFee: number;
  lowBalanceNoticeInDays: number | undefined;
  sidetreeTransactionPrefix: string;
  genesisBlockNumber: number;
  genesisBlockHash: string;
  mongoDbConnectionString: string;
  databaseName: string | undefined;
  maxSidetreeTransactions: number;
  defaultTimeoutInMilliseconds: number | undefined;
  maxRetries: number | undefined;
  transactionPollPeriodInSeconds: number | undefined;
}

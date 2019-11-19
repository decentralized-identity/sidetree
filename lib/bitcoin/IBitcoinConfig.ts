import ProofOfFeeConfig from './models/ProofOfFeeConfig';

/**
 * Defines all the configuration parameters needed to initialize Sidetree bitcoin service.
 */
export interface IBitcoinConfig {
  bitcoinPeerUri: string;
  bitcoinRpcUsername: string | undefined;
  bitcoinRpcPassword: string | undefined;
  bitcoinWalletImportString: string;
  lowBalanceNoticeInDays: number | undefined;
  sidetreeTransactionPrefix: string;
  genesisBlockNumber: number;
  mongoDbConnectionString: string;
  databaseName: string | undefined;
  transactionFetchPageSize: number;
  requestTimeoutInMilliseconds: number | undefined;
  requestMaxRetries: number | undefined;
  transactionPollPeriodInSeconds: number | undefined;
  proofOfFeeConfig: ProofOfFeeConfig;
}

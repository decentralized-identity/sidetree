/**
 * Defines all the configuration parameters needed to initialize Sidetree bitcoin service.
 */
export default interface IBitcoinConfig {
  bitcoinFeeSpendingCutoffPeriodInBlocks: number;
  bitcoinFeeSpendingCutoff: number;
  bitcoinPeerUri: string;
  bitcoinRpcUsername: string | undefined;
  bitcoinRpcPassword: string | undefined;
  bitcoinWalletImportString: string;
  lowBalanceNoticeInDays: number | undefined;
  sidetreeTransactionPrefix: string;
  genesisBlockNumber: number;
  mongoDbConnectionString: string;
  databaseName: string | undefined;
  requestTimeoutInMilliseconds: number | undefined;
  requestMaxRetries: number | undefined;
  transactionPollPeriodInSeconds: number | undefined;
  sidetreeTransactionFeeMarkupPercentage: number;
  valueTimeLockAmountInBitcoins: number;
  valueTimeLockPollPeriodInSeconds: number | undefined;
  valueTimeLockTransactionFeesAmountInBitcoins: number | undefined;
}

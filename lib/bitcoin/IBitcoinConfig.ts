import IBitcoinWallet from './interfaces/IBitcoinWallet';

/**
 * Defines all the configuration parameters needed to initialize Sidetree bitcoin service.
 */
export default interface IBitcoinConfig {
  bitcoinDataDirectory: string | undefined;
  bitcoinFeeSpendingCutoffPeriodInBlocks: number;
  bitcoinFeeSpendingCutoff: number;
  bitcoinPeerUri: string;
  bitcoinRpcUsername: string | undefined;
  bitcoinRpcPassword: string | undefined;
  bitcoinWalletOrImportString: IBitcoinWallet | string;
  defaultTransactionFeeInSatoshisPerKB: number | undefined;
  lowBalanceNoticeInDays: number | undefined;
  sidetreeTransactionPrefix: string;
  genesisBlockNumber: number;
  mongoDbConnectionString: string;
  databaseName: string;
  requestTimeoutInMilliseconds: number | undefined;
  requestMaxRetries: number | undefined;
  transactionPollPeriodInSeconds: number | undefined;
  sidetreeTransactionFeeMarkupPercentage: number;
  valueTimeLockAmountInBitcoins: number;
  valueTimeLockPollPeriodInSeconds: number | undefined;
  valueTimeLockTransactionFeesAmountInBitcoins: number | undefined;
}

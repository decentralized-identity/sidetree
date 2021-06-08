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
  databaseName: string;
  defaultTransactionFeeInSatoshisPerKB: number | undefined;
  genesisBlockNumber: number;
  mongoDbConnectionString: string;
  requestTimeoutInMilliseconds: number | undefined;
  requestMaxRetries: number | undefined;
  sidetreeTransactionFeeMarkupPercentage: number;
  sidetreeTransactionPrefix: string;
  transactionPollPeriodInSeconds: number;
  valueTimeLockUpdateEnabled: boolean;
  valueTimeLockAmountInBitcoins: number;
  valueTimeLockPollPeriodInSeconds: number;
  valueTimeLockTransactionFeesAmountInBitcoins: number | undefined;
}

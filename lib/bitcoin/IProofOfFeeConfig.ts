
/**
 * Defines configuration of approximate sliding windows used in
 * proof of fee calculation.
 */
export interface ISlidingWindowQuantileConfig {
  windowSizeInBlocks: number;
  windowSlideInBlocks: number;
  feeApproximation: number;
  sampleSize: number;
}

/**
 * Defines configuration of proof of fee calculation.
 */
export interface IProofOfFeeConfig {
  transactionFeeQuantileConfig: ISlidingWindowQuantileConfig;
  quantile: number;
  quantileScale: number;
  maxTransactionInputCount: number;
}

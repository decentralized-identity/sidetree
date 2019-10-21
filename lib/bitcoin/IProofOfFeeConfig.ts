
/**
 * Defines configuration of approximate sliding windows used in
 * proof of fee calculation.
 */
export interface ISlidingWindowQuantileConfig {
  windowSizeInBlocks: number;
  windowSlideInBlocks: number;
  transactionFeeApproximation: number;
  sampleSize: number;
}

/**
 * Defines configuration of proof of fee calculation.
 */
export interface IProofOfFeeConfig {
  slidingWindowQuantileConfig: ISlidingWindowQuantileConfig;
  quantile: number;
  quantileScale: number;
}

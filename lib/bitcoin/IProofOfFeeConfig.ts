
/**
 * Defines configuration of approximate sliding windows used in
 * proof of fee calculation.
 */
interface ISlidingWindowQuantileConfig {
  windowSizeInBatches: number;
  batchSizeInBlocks: number;
  feeApproximation: number;
  sampleSize: number;
  quantile: number;
}

/**
 * Defines configuration of proof of fee calculation.
 */
export default interface IProofOfFeeConfig {
  transactionFeeQuantileConfig: ISlidingWindowQuantileConfig;
  quantileScale: number;
  maxTransactionInputCount: number;
  historicalOffsetInBlocks: number;
}


/**
 * Defines configuration of approximate sliding windows used in
 * proof of fee calculation.
 */
interface SlidingWindowQuantileConfig {
  windowSizeInGroups: number;
  groupSizeInBlocks: number;
  feeApproximation: number;
  sampleSize: number;
  quantile: number;
}

/**
 * Defines configuration of proof of fee calculation.
 */
export default interface ProofOfFeeConfig {
  transactionFeeQuantileConfig: SlidingWindowQuantileConfig;
  quantileScale: number;
  maxTransactionInputCount: number;
  historicalOffsetInBlocks: number;
}


/**
 * Defines configuration of approximate sliding windows used in
 * proof of fee calculation.
 */
interface SlidingWindowQuantileConfig {
  /** Number of contiguous blocks that go into a group */
  groupSizeInBlocks: number;

  /** Size of the window in number of groups */
  windowSizeInGroups: number;

  /**
   * Transaction fees of bitcoin transactions are rounded so that we need to store
   * a smaller number of distinct values for computing quantiles. This parameter controls
   * the rounding - higher the value, poorer the rounded value approximates the original fee,
   * but lesser the space.
   */
  feeApproximation: number;

  /** Number of samples we store per-group */
  sampleSizePerGroup: number;

  /** Quantile measure we use for proof of fee; e.g., 0.5 would be the median */
  quantileMeasure: number;
}

/**
 * Defines configuration of proof of fee calculation.
 */
export default interface ProofOfFeeConfig {
  transactionFeeQuantileConfig: SlidingWindowQuantileConfig;
  maxTransactionInputCount: number;
  historicalOffsetInBlocks: number;
}

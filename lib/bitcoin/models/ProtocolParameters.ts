/**
 * Defines configuration of proof of fee calculation.
 */
export default interface ProtocolParameters {

  /** Number of contiguous blocks that go into a group */
  groupSizeInBlocks: number;

  /** Size of the window in number of groups */
  windowSizeInGroups: number;

  /** Number of samples we store per-group */
  sampleSizePerGroup: number;

  /** Quantile measure we use for proof of fee; e.g., 0.5 would be the median */
  quantileMeasure: number;

  /** The max amount that a quantile value is allowed to deviate from the previous value */
  maxQuantileDeviationPercentage: number;

  maxInputCountForSampledTransaction: number;
  historicalOffsetInBlocks: number;

  /** The maximum duration for the value-time-lock */
  maximumValueTimeLockDurationInBlocks: number;

  /** The minimum duration for the value-time-lock */
  minimumValueTimeLockDurationInBlocks: number;
}

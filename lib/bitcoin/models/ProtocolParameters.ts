/**
 * Defines configuration of proof of fee calculation.
 */
export default interface ProtocolParameters {
  /** The duration for the value-time-lock */
  valueTimeLockDurationInBlocks: number;

  /** The initial normalized fee in satoshis. */
  initialNormalizedFeeInSatoshis: number;

  /**
   * The look back window for normalized fee calculation
   * If this number is 10, then to calculate block X's normalized fee, it will look at blocks X - 10 to x - 1 to calculate.
   */
  feeLookBackWindowInBlocks: number;

  /**
   * The fluctuation rate cap. The normalized fee fluctuation cannot exceed this percentage. 1 being 100%.
   */
  feeMaxFluctuationMultiplierPerBlock: number;
}

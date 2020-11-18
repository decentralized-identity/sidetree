/**
 * Defines configuration of proof of fee calculation.
 */
export default interface ProtocolParameters {
  /** The duration for the value-time-lock */
  valueTimeLockDurationInBlocks: number;

  /** The initial normalized fee */
  initialNormalizedFee: number;
}

/**
 * Defines configuration of proof of fee calculation.
 */
export default interface ProtocolParameters {
  /** The maximum duration for the value-time-lock */
  maximumValueTimeLockDurationInBlocks: number;

  /** The minimum duration for the value-time-lock */
  minimumValueTimeLockDurationInBlocks: number;
}

/**
 * Holds metadata for a particular Sidetree version needed by the orchestration layer classes across all versions of the Sidetree.
 */
export default abstract class AbstractVersionMetadata {
  /** Hash algorithm in Multihash code in DEC (not in HEX). */
  public abstract hashAlgorithmInMultihashCode: number;
  /** multiplier on the per op fee */
  public abstract normalizedFeeToPerOperationFeeMultiplier: number;
}

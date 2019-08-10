/**
 * Holds metadata for a particular protocol version needed by the managing/orchastrating classes across all versions of the protocol implementations.
 */
export default interface IVersionInfo {
  /** Hash algorithm in Multihash code in DEC (not in HEX). */
  hashAlgorithmInMultihashCode: number;
}

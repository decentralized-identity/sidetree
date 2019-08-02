/**
 * Data model that holds protocol version info needed by the managing/orchastrating classes across all versions of the protocol implemetnations.
 */
export default interface IVersionInfo {
  /** Hash algorithm in Multihash code in DEC (not in HEX). */
  hashAlgorithmInMultihashCode: number;
}

/**	
 * Holds metadata for a particular Sidetree version needed by the orchastration layer classes across all versions of the Sidetree.
 */	
export default interface VersionMetadata {	
  /** Hash algorithm in Multihash code in DEC (not in HEX). */	
  hashAlgorithmInMultihashCode: number;	
}
/**
 * Defines the list of protocol parameters, intended ONLY to be used within each version of the protocol implementation.
 */
export default interface ProtocolParameters {
  /** Hash algorithm in Multihash code in DEC (not in HEX). */
  hashAlgorithmInMultihashCode: number;
  /** Maximum allowed size of anchor file stored in Content Addressable Storage. */
  maxAnchorFileSizeInBytes: number;
  /** Maximum allowed size of batch file stored in Content Addressable Storage. */
  maxBatchFileSizeInBytes: number;
  /** Maximum allowed length of any encoded hash string across all protocol versions until current point in time. */
  maxEncodedHashStringLength: number;
  /** Maximum operations per batch. */
  maxOperationsPerBatch: number;
  /** Maximum size of an operation in bytes. */
  maxOperationByteSize: number;
  /** The factor that converts the normalized fee from blockchain into a 'per operation' fee. */
  normalizedToPerOperationFeeFactor: number;
}

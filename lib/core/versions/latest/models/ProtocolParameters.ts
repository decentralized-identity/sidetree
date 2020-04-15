/**
 * Defines the list of protocol parameters, intended ONLY to be used within each version of the protocol implementation.
 */
export default interface ProtocolParameters {
  /** Hash algorithm in Multihash code in DEC (not in HEX). */
  hashAlgorithmInMultihashCode: number;
  /** Maximum allowed size of anchor file stored in Content Addressable Storage. */
  maxAnchorFileSizeInBytes: number;
  /** Maximum allowed size of map file stored in Content Addressable Storage. */
  maxMapFileSizeInBytes: number;
  /** Maximum allowed size of batch file stored in Content Addressable Storage. */
  maxBatchFileSizeInBytes: number;
  /** Maximum size of the `delta` property in bytes. */
  maxDeltaSizeInBytes: number;
  /** Max number of operations observed per transaction time */
  maxNumberOfOperationsPerTransactionTime: number;
  /** Maximum number of operations allowed with no lock. */
  maxNumberOfOperationsForNoValueTimeLock: number;
  /** Max number of transactions observed per transaction time */
  maxNumberOfTransactionsPerTransactionTime: number;
  /** Maximum operations per batch. */
  maxOperationsPerBatch: number;
  /** The multiplier that converts the normalized fee from blockchain into a 'per operation' fee. */
  normalizedFeeToPerOperationFeeMultiplier: number;
  /** The multiplier that converts the normalized 'per operation' fee into 'per operation lock amount' */
  valueTimeLockAmountMultiplier: number;
}

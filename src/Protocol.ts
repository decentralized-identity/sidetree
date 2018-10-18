const protocolVersions = require('../json/protocol.json');

// Reverse sorted protocol versions. ie. latest version first.
const protocolVersionsSorted = Object.values<Protocol>(protocolVersions).sort((a, b) => a.startingBlockNumber - b.startingBlockNumber);

/**
 * Defines protocol parameter values.
 */
export default interface Protocol {
  /** The inclusive starting block number that this protocol applies to. */
  startingBlockNumber: number;
  /** Hash algorithm in Multihash code in DEC (not in HEX). */
  hashAlgorithmInMultihashCode: number;
  /** Maximum operations per batch. */
  maxOperationsPerBatch: number;
  /** Maximum size of an operation in bytes. */
  maxOperationByteSize: number;
}

/**
 * Gets the corresponding protocol parameters as a Protocol object given the block number.
 */
export function getProtocol (blockNumber: number): Protocol {
  // Iterate through each version to find the right version.
  for (const protocol of protocolVersionsSorted) {
    if (blockNumber >= protocol.startingBlockNumber) {
      return protocol;
    }
  }

  throw new Error(`Unabled to find protocol parameters for the given block number ${blockNumber}`);
}

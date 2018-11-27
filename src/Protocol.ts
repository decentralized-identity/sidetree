/**
 * Defines protocol parameter values.
 */
export default interface Protocol {
  /** The inclusive starting logical blockchain time that this protocol applies to. */
  startingBlockchainTime: number;
  /** Hash algorithm in Multihash code in DEC (not in HEX). */
  hashAlgorithmInMultihashCode: number;
  /** Maximum operations per batch. */
  maxOperationsPerBatch: number;
  /** Maximum size of an operation in bytes. */
  maxOperationByteSize: number;
}

// Reverse sorted protocol versions. ie. latest version first.
let protocolVersionsSorted: Protocol[];

/**
 * Initializes the protocol parameters. Must be invoked frist before other calls.
 */
export function initializeProtocol (protocolFileName: string) {
  const protocolParameterFile = require(`../json/${protocolFileName}`);
  protocolVersionsSorted = Object.values<Protocol>(protocolParameterFile).sort((a, b) => b.startingBlockchainTime - a.startingBlockchainTime);
}

/**
 * Gets the corresponding protocol parameters as a Protocol object given the blockchain time.
 */
export function getProtocol (blockchainTime: number): Protocol {
  // Iterate through each version to find the right version.
  for (const protocol of protocolVersionsSorted) {
    if (blockchainTime >= protocol.startingBlockchainTime) {
      return protocol;
    }
  }

  throw new Error(`Unabled to find protocol parameters for the given blockchain time ${blockchainTime}`);
}

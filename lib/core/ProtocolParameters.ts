/**
 * Defines the list of protocol parameters.
 */
export interface IProtocolParameters {
  /** The inclusive starting logical blockchain time that this protocol applies to. */
  startingBlockchainTime: number;
  /** Hash algorithm in Multihash code in DEC (not in HEX). */
  hashAlgorithmInMultihashCode: number;
  /** Maximum allowed size of anchor file stored in Content Addressable Storage. */
  maxAnchorFileSizeInBytes: number;
  /** Maximum allowed size of batch file stored in Content Addressable Storage. */
  maxBatchFileSizeInBytes: number;
  /** Maximum operations per batch. */
  maxOperationsPerBatch: number;
  /** Maximum size of an operation in bytes. */
  maxOperationByteSize: number;
}

// Reverse sorted protocol versions. ie. latest version first.
let protocolParametersVersionsSorted: IProtocolParameters[];

// Cached list of supported hash algorithms.
let supportedHashAlgorithms: number[];

/**
 * Contains operations related to protocol parameters.
 */
export default class ProtocolParameters {

  /**
   * Initializes the protocol parameters versions.
   * Must be invoked first before other methods in this class.
   */
  public static initialize (protocolParametersVersions: IProtocolParameters[]) {
    // Reverse sort.
    protocolParametersVersionsSorted = protocolParametersVersions.sort((a, b) => b.startingBlockchainTime - a.startingBlockchainTime);

    // Compute and cache supported hash algorithms.
    supportedHashAlgorithms = protocolParametersVersionsSorted.map(version => version.hashAlgorithmInMultihashCode);
    supportedHashAlgorithms = Array.from(new Set(supportedHashAlgorithms)); // This line removes duplicates.
  }

  /**
   * Gets the corresponding protocol parameters as a Protocol object given the blockchain time.
   */
  public static get (blockchainTime: number): IProtocolParameters {
    // Iterate through each version to find the right version.
    for (const protocolParameters of protocolParametersVersionsSorted) {
      if (blockchainTime >= protocolParameters.startingBlockchainTime) {
        return protocolParameters;
      }
    }

    throw new Error(`Unabled to find protocol parameters for the given blockchain time ${blockchainTime}`);
  }

  /**
   * Gets the list of hash algorithms used by this Sidetree network.
   */
  public static getSupportedHashAlgorithms (): number[] {
    return supportedHashAlgorithms;
  }

}

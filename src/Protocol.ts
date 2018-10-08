const protocol = require('./protocol.json');

/**
 * The class that provides protocol parameter values.
 * TODO: Implement versioning support.
 */
export default class Protocol {
  /** Hash algorithm in Multihash code in DEC (not in HEX). */
  public static hashAlgorithmInMultihashCode: number = protocol['1.0']['hashAlgorithmInMultihashCode'];
  /** Maximum operations per batch. */
  public static maxOperationsPerBatch: number = protocol['1.0']['maxOperationsPerBatch'];
  /** Maximum size of an operation in bytes. */
  public static maxOperationByteSize: number = protocol['1.0']['maxOperationByteSize'];
}

const protocol = require('./protocol.json');

/**
 * The class that provides protocol parameter values.
 * TODO: Implement versioning support.
 */
export default class Protocol {
  /** Hash algorithm */
  public static hashAlgorithm: number = protocol['1.0']['hashAlgorithm'];
  /** Maximum operations per batch. */
  public static maxOperationsPerBatch: number = protocol['1.0']['maxOperationsPerBatch'];
  /** Maximum size of an operation in bytes. */
  public static maxOperationByteSize: number = protocol['1.0']['maxOperationByteSize'];
}

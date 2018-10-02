const protocol = require('./protocol.json');

/**
 * The class that provides protocol parameter values.
 * TODO: Implement versioning support.
 */
export default class Protocol {
  /**
   * Maximum operations per batch.
   */
  public static maxOperationsPerBatch: number = protocol['1.0']['maxOperationsPerBatch'];
}

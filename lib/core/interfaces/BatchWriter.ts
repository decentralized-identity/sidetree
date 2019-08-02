/**
 * Interface that defines a class that can write batches of operations to content addressable storage and blockchain.
 */
export default interface BatchWriter {
  /**
   * Writes one or more batches of batches of operations to content addressable storage and blockchain.
   */
  write (): Promise<void>;
}

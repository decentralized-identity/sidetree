/**
 * Interface that defines a class that can write batches of operations to content addressable storage and blockchain.
 */
export default interface IBatchWriter {
  /**
   * Writes one or more batches of batches of operations to content addressable storage and blockchain.
   * @returns The number of operations written.
   */
  write (): Promise<number>;
}

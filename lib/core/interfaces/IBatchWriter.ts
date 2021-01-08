/**
 * Interface that defines a class that can write batches of operations to content addressable storage and blockchain.
 */
export default interface IBatchWriter {
  /**
   * Writes one or more batches of batches of operations to content addressable storage and blockchain.
   * @returns The size of the batch written, 0 if no batch is written.
   */
  write (): Promise<number>;
}

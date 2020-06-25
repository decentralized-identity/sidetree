/**
 * Reader for bitcoin files from bitcoin data directory
 */
export default interface IBitcoinFileReader {
  /**
   * List all files in the block directory
   */
  listBlockFiles (): string[];

  /**
   * Read a block file as buffer
   */
  readBlockFile (fileName: string): Buffer;
}

/**
 * Interface that declares methods that should be implemented by all sidetree storage providers.
 */
export interface Storage {
  /**
   * Reads the content of the given content identifier.
   * @param address Content identifier to fetch the content
   * @returns The content of the given address
   */
  read (address: string): Promise<Buffer>;

  /**
   * Writes the passed content to the IPFS storage.
   * @param content Sidetree content to write to IPFS storage
   * @returns The multihash content identifier of the written content
   */
  write (content: Buffer): Promise<string>;
}

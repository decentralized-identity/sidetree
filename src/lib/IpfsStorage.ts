import * as Ipfs from 'ipfs';

/**
 * Class that implements the IPFS Storage functionality.
 */
export class IpfsStorage {
  /**  IPFS node instance  */
  public node: Ipfs;
  /**  IPFS Storage class object  */
  static ipfsStorageInstance: IpfsStorage;

  /**
   * Static method to have a single instance of class and mock in unit tests
   */
  public static create (options: Ipfs.Options): IpfsStorage {
    if (!IpfsStorage.ipfsStorageInstance) {
      IpfsStorage.ipfsStorageInstance = new IpfsStorage(options);
    }

    return IpfsStorage.ipfsStorageInstance;
  }

  private constructor (options: Ipfs.Options) {
    this.node = Ipfs.createNode(options);
  }

  /**
   * Reads the stored content of the content identifier.
   * @param hash Content identifier to fetch the content.
   * @returns The content of the given hash.
   */
  public async read (hash: string): Promise<Buffer> {
    const files = await this.node.files.get(hash);
    return files[0].content as Buffer;
  }

  /**
   * Writes the passed content to the IPFS storage.
   * @param content Sidetree content to write to IPFS storage.
   * @returns The multihash content identifier of the stored content.
   */
  public async write (content: Buffer): Promise<string> {
    const files = await this.node.files.add(content);
    return files[0].hash;
  }
}

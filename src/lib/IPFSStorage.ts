import * as Ipfs from 'ipfs';

/**
 * Class that implements the IPFS Storage functionality.
 */
export class IpfsStorage {
  /**  IPFS node instance  */
  public node: Ipfs;
  /**  IPFS Storage class object  */
  static ipfsStorageInstance: IpfsStorage;
  /**  IPFS options to create an IPFS node */
  static ipfsOptions: Ipfs.Options;
  /**
   * Static method to have a single instance of class and mock in unit tests
   */
  public static createIPFSNode (options?: Ipfs.Options): IpfsStorage {
    if (options) {
      IpfsStorage.ipfsOptions = options;
    }
    if (!IpfsStorage.ipfsStorageInstance) {
      IpfsStorage.ipfsStorageInstance = new IpfsStorage();
    }

    return IpfsStorage.ipfsStorageInstance;
  }

  private constructor () {
    this.node = Ipfs.createNode(IpfsStorage.ipfsOptions);
  }

  /**
   * Reads the stored content of the content identifier.
   * @param hash Content identifier to fetch the content.
   * @returns The content of the given hash.
   */
  public async read (hash: string): Promise<Buffer> {
    let files = await this.node.files.get(hash);
    return files[0].content as Buffer;
  }

  /**
   * Writes the passed content to the IPFS storage.
   * @param content Sidetree content to write to IPFS storage.
   * @returns The multihash content identifier of the stored content.
   */
  public async write (content: Buffer): Promise<string> {
    let files = await this.node.files.add(content);
    return files[0].hash;
  }
}

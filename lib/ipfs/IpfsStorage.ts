import * as IPFS from 'ipfs';

/**
 * Class that implements the IPFS Storage functionality.
 */
export default class IpfsStorage {

  /**  IPFS node instance  */
  public node: IPFS;
  /**  IPFS Storage class object  */
  static ipfsStorageInstance: IpfsStorage;

  /**
   * Static method to have a single instance of class and mock in unit tests
   */
  public static create (repo?: any): IpfsStorage {
    if (!IpfsStorage.ipfsStorageInstance) {
      IpfsStorage.ipfsStorageInstance = new IpfsStorage(repo);
    }

    return IpfsStorage.ipfsStorageInstance;
  }

  private constructor (repo?: any) {
    const repoName = 'sidetree-ipfs';
    const options = {
      repo: repo !== undefined ? repo : repoName
    };

    this.node = new IPFS(options);
  }

  /**
   * Reads the stored content of the content identifier.
   * @param hash Content identifier to fetch the content.
   * @returns The content of the given hash.
   */
  public async read (hash: string): Promise<Buffer> {
    // files.get fetches the content from network if not available in local repo and stores in cache which is garbage collectable
    const files = await this.node.get(hash);

    // Store the fetched content in local repo. Re-pinning already exisitng object doesnt create a duplicate.
    await this.node.pin.add(hash);
    return files[0].content as Buffer;
  }

  /**
   * Writes the passed content to the IPFS storage.
   * @param content Sidetree content to write to IPFS storage.
   * @returns The multihash content identifier of the stored content.
   */
  public async write (content: Buffer): Promise<string> {
    const files = await this.node.add(content);
    return files[0].hash;
  }
}

import * as Ipfs from 'ipfs';
import { Storage } from './Storage';

/**
 * Class that implements the IPFS Storage functionality.
 */
export class IpfsStorage implements Storage {
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

  public async read (hash: string): Promise<Buffer> {
    let fileContent: Buffer | undefined | NodeJS.ReadableStream = Buffer.from('');

    await this.node.files.get(hash)
    .then((files: Ipfs.Files[]) => {
      fileContent = files[0].content;
    });

    return fileContent;
  }

  public async write (content: Buffer): Promise<string> {
    let fileHash: string = '';

    await this.node.files.add(content)
    .then((files: Ipfs.IPFSFile[]) => {
      fileHash = files[0].hash;
    });

    return fileHash;
  }
}

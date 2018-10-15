import * as IPFS from 'ipfs';
import { Storage } from './Storage';

/**
 * Class that implements the IPFS Storage functionality.
 */
export class IPFSStorage implements Storage {
  /**  IPFS node instance  */
  public node?: IPFS;
  /**  IPFS Storage class object  */
  static ipfsStorageInstance?: IPFSStorage;
  /**  IPFS options to create an IPFS node */
  static ipfsOptions?: IPFS.Options;
  /**
   * Static method to have a single instance of class and mock in unit tests
   */
  public static createIPFSNode (options?: IPFS.Options): IPFSStorage {
    if (!options) {
      IPFSStorage.ipfsOptions = options;
    }
    if (!IPFSStorage.ipfsStorageInstance) {
      IPFSStorage.ipfsStorageInstance = new IPFSStorage();
    }

    return IPFSStorage.ipfsStorageInstance;
  }

  private constructor () {
    if (!this.node) {
      this.node = IPFS.createNode(IPFSStorage.ipfsOptions!);
    }
  }

  public async read (hash: string): Promise<Buffer> {
    let fileContent: Buffer | undefined | NodeJS.ReadableStream = Buffer.from('');

    await this.node!.files.get(hash)
    .then((files: IPFS.Files[]) => {
      fileContent = files[0].content;
    })
    .catch((err) => {
      throw new Error(err);
    });

    return fileContent;
  }

  public async write (content: Buffer): Promise<string> {
    let fileHash: string = '';

    await this.node!.files.add(content)
    .then((files: IPFS.IPFSFile[]) => {
      fileHash = files[0].hash;
    })
    .catch((err) => {
      throw new Error(err);
    });

    return fileHash;
  }
}

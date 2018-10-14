import * as IPFS from 'ipfs';
import { Storage } from './Storage';

/**
 * Class that implements the IPFS Storage functionality.
 */
export class IPFSStorage implements Storage {
  public node?: IPFS;
  static ipfsStorageInstance?: IPFSStorage;
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

    await this.node!.files.get(hash).then((files) => {
      files.forEach((file) => {
        console.log(file.path);
        fileContent = file.content;
      });
    });

    return fileContent;
  }
}

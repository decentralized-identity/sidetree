import * as IPFS from 'ipfs';
import { Storage } from './Storage';

let node: IPFS;

/**
 * Class that implements the IPFS Storage functionality.
 */
export class IPFSStorage implements Storage {

  private constructor () {
    if (!node) {
      const options: IPFS.Options = {
        repo: 'sidetree-ipfs'
      };

      node = new IPFS(options);
    }
  }

  public async read (hash: string): Promise<Buffer> {
    let fileContent: Buffer | undefined | NodeJS.ReadableStream = Buffer.from('');

    node.files.get(hash, (err, files) => {
      if (err) {
        throw new Error('Failed to fetch data');
      }
      if (files) {
        files.forEach((file) => {
          console.log(file.path);
          fileContent = file.content;
        });
      }
    });

    return fileContent;
  }
}

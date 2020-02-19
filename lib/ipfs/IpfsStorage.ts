import * as IPFS from 'ipfs';
import FetchResult from '../common/models/FetchResult';
import FetchResultCode from '../common/FetchResultCode';

/**
 * Class that implements the IPFS Storage functionality.
 */
export default class IpfsStorage {

  /**  IPFS node instance  */
  private node: IPFS;
  /**  IPFS Storage class object  */
  static ipfsStorageInstance: IpfsStorage;

  /**
   * Static method to have a single instance of class and mock in unit tests
   */
  public static async create (repo?: any): Promise<IpfsStorage> {
    if (!IpfsStorage.ipfsStorageInstance) {
      const repoName = 'sidetree-ipfs';
      const options = {
        repo: repo !== undefined ? repo : repoName
      };
      const node = await IPFS.create(options);
      IpfsStorage.ipfsStorageInstance = new IpfsStorage(node);
    }

    return IpfsStorage.ipfsStorageInstance;
  }

  private constructor (node: IPFS) {
    this.node = node;
  }

  /**
   * Reads the stored content of the content identifier.
   * @param hash Content identifier to fetch the content.
   * @param maxSizeInBytes The maximum allowed size limit of the content.
   * @returns The fetch result containg the content buffer if found.
   *          The result `code` is set to `FetchResultCode.NotFound` if the content is not found.
   *          The result `code` is set to `FetchResultCode.MaxSizeExceeded` if the content exceeds the specified max size.
   *          The result `code` is set to `FetchResultCode.NotAFile` if the content being downloaded is not a file (e.g. a directory).
   */
  public async read (hash: string, maxSizeInBytes: number): Promise<FetchResult> {
    // If we hit error attempting to fetch the content metadata, return not-found.
    let contentMetadata = undefined;
    try {
      contentMetadata = await this.node.object.stat(hash);
    } catch (error) {
      console.info(error);
      return { code: FetchResultCode.NotFound };
    }

    if (contentMetadata.DataSize > maxSizeInBytes) {
      console.info(`Size of ${contentMetadata.DataSize} bytes is greater than the ${maxSizeInBytes} data size limit.`);
      return { code: FetchResultCode.MaxSizeExceeded };
    }

    const fetchResult = await this.fetchContent(hash, maxSizeInBytes);

    // "Pin" (store permanently in local repo) content if fetch is successful. Re-pinning already existing object does not create a duplicate.
    if (fetchResult.code === FetchResultCode.Success) {
      await this.node.pin.add(hash);
    }

    return fetchResult;
  }

  /**
   * Fetch the content from IPFS.
   * This method also allows easy mocking in tests.
   */
  private async fetchContent (hash: string, maxSizeInBytes: number): Promise<FetchResult> {

    let fetchResult: FetchResult = { code: FetchResultCode.Success };
    let bufferChunks: Buffer[] = [];
    let currentContentSize = 0;

    try {
      for await (const chunk of this.node.cat(hash)) {
        // this loop has the potential to get stuck forever if hash is invalid or node is super slow
        currentContentSize += chunk.byteLength;
        if (maxSizeInBytes < currentContentSize) {
          console.info(`Max size of ${maxSizeInBytes} bytes exceeded by CID ${hash}`);
          return { code: FetchResultCode.MaxSizeExceeded };
        }
        bufferChunks.push(chunk);
      }
    } catch (e) {
      // when an error is thrown, that means the hash points to something that is not a file
      console.log(`Error thrown while downloading content from IPFS: ${e}`);
      return { code: FetchResultCode.NotAFile };
    }

    fetchResult.content = Buffer.concat(bufferChunks);

    return fetchResult;
  }

  /**
   * Writes the passed content to the IPFS storage.
   * @param content Sidetree content to write to IPFS storage.
   * @returns The multihash content identifier of the stored content.
   */
  public async write (content: Buffer): Promise<string> {
    const file = await this.node.add(content).next();
    return file.value.cid.toString();
  }

  /**
   * Stops this IPFS store.
   */
  public stop () {
    this.node.stop();
  }
}

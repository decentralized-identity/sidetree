import * as IPFS from 'ipfs';
import FetchResult from '../common/models/FetchResult';
import FetchResultCode from '../common/FetchResultCode';
import AsyncTimeout from '../common/AsyncTimeout';

/**
 * Class that implements the IPFS Storage functionality.
 */
export default class IpfsStorage {

  private static timeoutDuration: number = 10000; // 10 seconds timeout
  /**  IPFS node instance  */
  private node: IPFS;

  /**
   * Static method to return an instance if IpfsStorage. If no argument passed in, it uses default local repo
   */
  public static async create (repo?: any): Promise<IpfsStorage> {
    const localRepoName = 'sidetree-ipfs';
    const options = {
      repo: repo !== undefined ? repo : localRepoName
    };
    const node = await IPFS.create(options);
    return new IpfsStorage(node);
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
      contentMetadata = (await AsyncTimeout.timeoutAsyncCall(this.node.object.stat(hash), IpfsStorage.timeoutDuration)).result;
    } catch (error) {
      console.info(error);
      return { code: FetchResultCode.NotFound };
    }

    if (contentMetadata === undefined || contentMetadata.DataSize === undefined) {
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

    const fetchResult: FetchResult = { code: FetchResultCode.Success };
    let bufferChunks: Buffer[] = [];
    let currentContentSize = 0;

    try {
      const iterator = this.node.cat(hash);
      // IteratorResult<Buffer, any> | IteratorYieldResult<Buffer> | undefined
      // are the possible types but iterator results are not exposed
      let result: any;
      do {
        result = (await AsyncTimeout.timeoutAsyncCall(iterator.next(), IpfsStorage.timeoutDuration)).result;
        if (result === undefined) {
          return { code: FetchResultCode.NotFound };
        }

        if (result.value !== undefined) {
          const chunk = result.value;
          currentContentSize += chunk.byteLength;
          if (maxSizeInBytes < currentContentSize) {
            console.info(`Max size of ${maxSizeInBytes} bytes exceeded by CID ${hash}`);
            return { code: FetchResultCode.MaxSizeExceeded };
          }
          bufferChunks.push(chunk);
        }
      } while (!result.done);
    } catch (e) {
      // when an error is thrown, that means the hash points to something that is not a file
      console.log(`Error thrown while downloading content from IPFS: ${JSON.stringify(e, Object.getOwnPropertyNames(e))}`);
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
  public async stop () {
    await this.node.stop();
  }

}

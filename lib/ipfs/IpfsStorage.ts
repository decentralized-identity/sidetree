import * as IPFS from 'ipfs';
import ErrorCode from '../ipfs/ErrorCode';
import FetchResult from '../common/models/FetchResult';
import FetchResultCode from '../common/enums/FetchResultCode';
import SidetreeError from '../common/SidetreeError';

/**
 * Class that implements the IPFS Storage functionality.
 */
export default class IpfsStorage {

  /**  IPFS node instance  */
  private node: IPFS;

  /** singleton holding the instance of ipfsStorage to use */
  private static ipfsStorageSingleton: IpfsStorage | undefined;

  /**
   * Create and return the singleton instance of the ipfsStorage if doesn't already exist
   */
  public static async createSingleton (repo?: any): Promise<IpfsStorage> {
    if (IpfsStorage.ipfsStorageSingleton !== undefined) {
      throw new SidetreeError(ErrorCode.IpfsStorageInstanceCanOnlyBeCreatedOnce,
        'IpfsStorage is a singleton thus cannot be created twice. Please use the getSingleton method to get the instance');
    }

    const localRepoName = 'sidetree-ipfs';
    const options = {
      repo: repo !== undefined ? repo : localRepoName
    };
    const node = await IPFS.create(options);
    IpfsStorage.ipfsStorageSingleton = new IpfsStorage(node);
    return IpfsStorage.ipfsStorageSingleton;
  }

  /**
   * Get the singleton instance of the ipfsStorage if exists.
   */
  public static getSingleton (): IpfsStorage {
    if (IpfsStorage.ipfsStorageSingleton === undefined) {
      throw new SidetreeError(ErrorCode.IpfsStorageInstanceGetHasToBeCalledAfterCreate,
        'IpfsStorage is a singleton, Please use the createSingleton method before get');
    }
    return IpfsStorage.ipfsStorageSingleton;
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
    let iterator: AsyncIterator<Buffer>;
    try {
      iterator = this.node.cat(hash);
    } catch (e) {
      // when an error is thrown, certain error message denote that the CID is not a file, anything else is unexpected error from ipfs
      console.debug(`Error thrown while downloading content from IPFS for CID ${hash}: ${JSON.stringify(e, Object.getOwnPropertyNames(e))}`);
      if (IpfsStorage.isIpfsErrorNotAFileError(e.message)) {
        return { code: FetchResultCode.NotAFile };
      } else {
        return { code: FetchResultCode.NotFound };
      }
    }

    let result: IteratorResult<Buffer>;
    try {
      do {
        result = await iterator.next();
        // the linter cannot detect that result.value can be undefined, so we disable it. The code should still compile
        /* tslint:disable-next-line */
        if (result.value !== undefined) {
          const chunk = result.value;
          currentContentSize += chunk.byteLength;
          if (maxSizeInBytes < currentContentSize) {
            console.info(`Max size of ${maxSizeInBytes} bytes exceeded by CID ${hash}`);
            return { code: FetchResultCode.MaxSizeExceeded };
          }
          bufferChunks.push(chunk);
        }
      // done will always be true if it is the last element. When it is not, it can be false or undefined, which in js !undefined === true
      } while (!result.done);
    } catch (e) {
      console.error(`unexpected error thrown for CID ${hash}, please investigate and fix: ${JSON.stringify(e, Object.getOwnPropertyNames(e))}`);
      throw e;
    }

    if (bufferChunks.length === 0) {
      return { code: FetchResultCode.NotFound };
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

  /**
   * Checks if a certain error message corresponds to the not a file error from ipfs
   * @param errorText the error text that matches the ipfs implementation of not a file error
   */
  private static isIpfsErrorNotAFileError (errorText: string) {
    // a set of error texts ipfs use to denote not a file
    const notAFileErrorTextSet = new Set(['this dag node is a directory', 'this dag node has no content']);
    return notAFileErrorTextSet.has(errorText);
  }

}

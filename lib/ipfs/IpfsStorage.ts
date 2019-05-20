import * as IPFS from 'ipfs';
import { FetchResult, FetchResultCode } from '../core/Cas';

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
      contentMetadata = await (this.node as any).object.stat(hash);
    } catch (error) {
      console.info(error);
      return { code: FetchResultCode.NotFound };
    }

    // If content size cannot be found, return not-found.
    if (contentMetadata === undefined || contentMetadata.CumulativeSize === undefined) {
      return { code: FetchResultCode.NotFound };
    }

    // NOTE: IPFS API does not have an API for finding out only the content size,
    // IPFS API only provides the "cumulative size" that includes the additional metadata on how the Merkle DAG is formed.
    // So here we account for the additional space used by performing a more lenient max size check by 10%,
    // we will track the exact conent size of content later when we fetch the content if the content passes this size check.
    const adjustedMaxSize = maxSizeInBytes * 1.1;
    if (contentMetadata.CumulativeSize > adjustedMaxSize) {
      console.info(`Cumulative size of ${contentMetadata.CumulativeSize} bytes is greater than the ${adjustedMaxSize} cumulative size limit.`);
      return { code: FetchResultCode.MaxSizeExceeded };
    }

    // NOTE: it appears that even if we destroy the readable stream half way, IPFS node in the backend will complete fetch of the file,
    // so the size check above although not 100 accurate, is necessary as an optimzation.
    const fetchResult = await this.fetchContent(hash, maxSizeInBytes);

    // "Pin" (store permanently in local repo) content if fetch is successful. Re-pinning already exisitng object does not create a duplicate.
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
    // files.getReadableStream() fetches the content from network if not available in local repo and stores in cache which will be garbage collectable.
    const readableStream = await (this.node as any).getReadableStream(hash);

    let fetchResult: FetchResult = { code: FetchResultCode.Success };
    let bufferChunks: Buffer[] = [];
    let currentContentSize = 0;
    let resolveFunction: any;
    let rejectFunction: any;

    const fetchContent = new Promise((resolve, reject) => {
      resolveFunction = resolve;
      rejectFunction = reject;
    });

    readableStream.on('data', (file: any) => {
      // If content is of directory type, set return code as "not a file", no need to setup content stream listeners.
      if (file.type === 'dir') {
        console.info(`Content is of directory type for hash ${hash}, skipping this bad request.`);
        fetchResult.code = FetchResultCode.NotAFile;

        readableStream.destroy();
        return;
      }

      // Else setting all the even listners and resume content stream fetching.
      file.content.on('data', (chunk: Buffer) => {
        currentContentSize += chunk.length;

        // If content size exceeds the max size limit, immediate stop further stream reading.
        if (currentContentSize > maxSizeInBytes) {
          console.info(`Content stream reached ${currentContentSize} bytes which is greater than the ${maxSizeInBytes} bytes limit.`);
          fetchResult.code = FetchResultCode.MaxSizeExceeded;

          readableStream.destroy();
          return;
        }

        bufferChunks.push(chunk);
      });

      file.content.on('error', () => {
        rejectFunction();
      });
      file.content.on('close', () => {
        resolveFunction();
      });
      file.content.on('end', () => {
        resolveFunction();
      });

      file.content.resume();
    });

    await fetchContent;

    if (fetchResult.code === FetchResultCode.Success) {
      fetchResult.content = Buffer.concat(bufferChunks);
    }

    return fetchResult;
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

  /**
   * Stops this IPFS store.
   */
  public stop () {
    this.node.stop();
  }
}

import * as IPFS from 'ipfs';
import FetchResult from '../common/models/FetchResult';
import FetchResultCode from '../common/enums/FetchResultCode';

/**
 * Class that implements the IPFS Storage functionality.
 */
export default class IpfsStorage {

  /**  IPFS node instance  */
  private node: IPFS | undefined;
  private repo: any;
  private healthy: boolean;
  private healthCheckInternalInSeconds: number;

  /**
   * the constructor itself is not functional, the initialize function needs to be called to be healthy
   * @param repo the repo to store ipfs data in
   */
  public constructor (repo?: any) {
    this.repo = repo;
    this.healthy = false; // need to initialize to be healthy
    this.healthCheckInternalInSeconds = 60;
  }

  private async getNode (): Promise<IPFS> {
    const localRepoName = 'sidetree-ipfs';
    const options = {
      repo: this.repo !== undefined ? this.repo : localRepoName
    };
    const node = await IPFS.create(options);
    return node;
  }

  /**
   * Start periodic health check and start up ipfs node
   */
  public initialize () {
    setImmediate(async () => this.healthCheck());
  }

  private async healthCheck () {
    try {
      if (!this.healthy) {
        console.log('Unhealthy, restarting IPFS node...');
        await this.restart();
        this.healthy = true;
      }
    } catch (e) {
      console.error(`unknown error thrown by healthCheck: ${e}`);
    } finally {
      setTimeout(async () => this.healthCheck(), this.healthCheckInternalInSeconds * 1000);
    }
  }

  /**
   * restarts the IPFS node
   */
  private async restart () {
    if (this.node !== undefined) {
      await this.node.stop();
      console.log('old node stopped, starting a new one');
    }
    this.node = await this.getNode();
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
    try {
      const fetchResult = await this.fetchContent(hash, maxSizeInBytes);

      // "Pin" (store permanently in local repo) content if fetch is successful. Re-pinning already existing object does not create a duplicate.
      if (fetchResult.code === FetchResultCode.Success) {
        await this.node!.pin.add(hash);
      }
      return fetchResult;
    } catch {
      this.healthy = false;
      return {
        code: FetchResultCode.CasNotReachable
      };
    }
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
      iterator = this.node!.cat(hash);
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
  public async write (content: Buffer): Promise<string | undefined> {
    try {
      const file = await this.node!.add(content).next();
      return file.value.cid.toString();
    } catch (e) {
      console.log(`Error thrown while writing: ${e}`);
      this.healthy = false;
      return undefined;
    }
  }

  /**
   * Stops this IPFS store.
   */
  public async stop () {
    if (this.node !== undefined) {
      await this.node.stop();
    }
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

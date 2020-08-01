import FetchResult from '../common/models/FetchResult';
import FetchResultCode from '../common/enums/FetchResultCode';
import nodeFetch from 'node-fetch';
import ReadableStream from '../common/ReadableStream';
import httpStatus = require('http-status');
import SharedErrorCode from '../common/SharedErrorCode';
import SidetreeError from '../common/SidetreeError';

/**
 * Class that implements the IPFS Storage functionality.
 */
export default class IpfsStorage {
  private fetch = nodeFetch;

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
        await this.fetch(`http://127.0.0.1:5001/api/v0/pin?arg=${hash}`, { method: 'POST' });
      }
      return fetchResult;
    } catch {
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
  
    let response;
    try {
      response = await this.fetch(`http://127.0.0.1:5001/api/v0/cat?arg=${hash}`, { method: 'POST' });
    } catch (e) {
      // when an error is thrown, certain error message denote that the CID is not a file, anything else is unexpected error from ipfs
      console.debug(`Error thrown while downloading content from IPFS for CID ${hash}: ${JSON.stringify(e, Object.getOwnPropertyNames(e))}`);
      if (IpfsStorage.isIpfsErrorNotAFileError(e.message)) {
        return { code: FetchResultCode.NotAFile };
      } else {
        return { code: FetchResultCode.NotFound };
      }
    }

    try {
      fetchResult.content = await ReadableStream.read(response.body, maxSizeInBytes);
      return fetchResult;
    } catch (error) {
      if (error instanceof SidetreeError &&
          error.code === SharedErrorCode.ReadableStreamMaxAllowedDataSizeExceeded) {
        return { code: FetchResultCode.MaxSizeExceeded };
      }

      console.error(`unexpected error thrown for CID ${hash}, please investigate and fix: ${SidetreeError.stringify(error)}`);
      throw error;
    }
  }

  /**
   * Writes the passed content to the IPFS storage.
   * @param content Sidetree content to write to IPFS storage.
   * @returns The multihash content identifier of the stored content.
   */
  public async write (content: Buffer): Promise<string | undefined> {
    try {
      const multipartBoundaryString = 'henryBoundaryString';
      const beginBoundary = Buffer.from(`--${multipartBoundaryString}\n`);
      const firstPartContentType = Buffer.from(`Content-Type: application/octet-stream\n\n`);
      const endBoundary = Buffer.from(`\n--${multipartBoundaryString}--`);
      const requestBody = Buffer.concat([beginBoundary, firstPartContentType, content, endBoundary]);

      const requestParameters = {
        method: 'POST',
        body: requestBody,
        headers: { 'Content-Type': `multipart/form-data; boundary=${multipartBoundaryString}` }
      };
      const response = await this.fetch('http://127.0.0.1:5001/api/v0/add', requestParameters);
      if (response.status !== httpStatus.OK) {
        console.error(`IPFS write error response status: ${response.status}`);
  
        if (response.body) {
          const errorBody = await ReadableStream.readAll(response.body);
          console.error(`IPFS write error body: ${errorBody}`);
        }
  
        throw new Error('Encountered an error writing content to IPFS.');
      }
  
      const body = await ReadableStream.readAll(response.body);
      const hash = JSON.parse(body.toString()).Hash;
  
      return hash;
    } catch (e) {
      console.log(`Error thrown while writing: ${e}`);
      return undefined;
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

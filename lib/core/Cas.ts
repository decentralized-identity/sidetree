import * as HttpStatus from 'http-status';
import IFetchResult from '../common/IFetchResult';
import nodeFetch from 'node-fetch';
import ReadableStream from '../common/ReadableStream';
import { FetchResultCode } from '../common/FetchResultCode';

/**
 * Interface for accessing the underlying CAS (Content Addressable Store).
 * This interface is mainly useful for creating a mock CAS for testing purposes.
 */
export interface Cas {
  /**
   * Writes the given content to CAS.
   * @returns The SHA256 hash in base64url encoding which represents the address of the content.
   */
  write (content: Buffer): Promise<string>;

  /**
   * Reads the content of the given address in CAS.
   * @param maxSizeInBytes The maximum allowed size limit of the content.
   * @returns The fetch result containg the content buffer if found.
   *          The result `code` is set to `FetchResultCode.MaxSizeExceeded` if the content exceeds the specified max size.
   */
  read (address: string, maxSizeInBytes: number): Promise<IFetchResult>;
}

/**
 * Class that communicates with the underlying CAS using REST API defined by the protocol document.
 */
export class CasClient implements Cas {

  private fetch = nodeFetch;

  public constructor (public uri: string) { }

  public async write (content: Buffer): Promise<string> {
    const requestParameters = {
      method: 'post',
      body: content,
      headers: { 'Content-Type': 'application/octet-stream' }
    };
    const response = await this.fetch(this.uri, requestParameters);
    if (response.status !== HttpStatus.OK) {
      console.error(`CAS write error response status: ${response.status}`);

      if (response.body) {
        const errorBody = await ReadableStream.readAll(response.body);
        console.error(`CAS write error body: ${errorBody}`);
      }

      throw new Error('Encountered an error writing content to CAS.');
    }

    const bodyString = await ReadableStream.readAll(response.body);
    const hash = JSON.parse(bodyString).hash;

    return hash;
  }

  public async read (address: string, maxSizeInBytes: number): Promise<IFetchResult> {
    try {
      // Fetch the resource.
      const queryUri = `${this.uri}/${address}?max-size=${maxSizeInBytes}`;
      const response = await this.fetch(queryUri);
      if (response.status === HttpStatus.NOT_FOUND) {
        return { code: FetchResultCode.NotFound };
      }

      if (response.status === HttpStatus.BAD_REQUEST) {
        const errorBody = await ReadableStream.readAll(response.body);
        return JSON.parse(errorBody);
      }

      if (response.status !== HttpStatus.OK) {
        console.error(`CAS '${address}' read response status: ${response.status}`);

        if (response.body) {
          const errorBody = await ReadableStream.readAll(response.body);
          console.error(`CAS '${address}' read error body: ${errorBody}`);
        }

        console.error(`Treating '${address}' read as not-found, but should investigate.`);
        return { code: FetchResultCode.NotFound };
      }

      const content = await ReadableStream.readAll(response.body);

      return {
        code: FetchResultCode.Success,
        content: Buffer.from(content)
      };
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        return { code: FetchResultCode.CasNotReachable };
      }

      // Else throw
      throw error;
    }
  }
}

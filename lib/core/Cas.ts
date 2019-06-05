import * as HttpStatus from 'http-status';
import nodeFetch from 'node-fetch';
import ReadableStream from './util/ReadableStream';

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
  read (address: string, maxSizeInBytes: number): Promise<FetchResult>;
}

/**
 * Data structure representing the result of a content fetch from the Content Addressable Storage.
 */
export interface FetchResult {
  /** Return code for the fetch. */
  code: FetchResultCode;
  content?: Buffer;
}

/**
 * Return code for a fetch.
 */
export enum FetchResultCode {
  Success = 'success',
  NotFound = 'content_not_found',
  MaxSizeExceeded = 'content_exceeds_maximum_allowed_size',
  NotAFile = 'content_not_a_file'
}

/**
 * Class that communicates with the underlying CAS using REST API defined by the protocol document.
 */
export class CasClient implements Cas {

  private fetch = nodeFetch;

  public constructor (public uri: string) { }

  /**
   * TODO: consider using multi-hash format.
   */
  public async write (content: Buffer): Promise<string> {
    const requestParameters = {
      method: 'post',
      body: content,
      headers: { 'Content-Type': 'application/octet-stream' }
    };
    const response = await this.fetch(this.uri, requestParameters);
    if (response.status !== HttpStatus.OK) {
      console.error(`CAS write error response status: ${response.status}`);
      console.error(`CAS write error body: ${response.body.read()}`);
      throw new Error('Encountered an error writing content to CAS.');
    }

    const hash = JSON.parse(response.body.read().toString()).hash;

    return hash;
  }

  public async read (address: string, maxSizeInBytes: number): Promise<FetchResult> {
    // Fetch the resource.
    const queryUri = `${this.uri}/${address}?max-size=${maxSizeInBytes}`;
    const response = await this.fetch(queryUri);
    if (response.status === HttpStatus.NOT_FOUND) {
      return { code: FetchResultCode.NotFound };
    }

    if (response.status === HttpStatus.BAD_REQUEST) {
      return JSON.parse(response.body.read().toString());
    }

    if (response.status !== HttpStatus.OK) {
      console.info(`CAS '${address}' read response status: ${response.status}`);
      console.info(`CAS '${address}' read error body: ${response.body.read()}`);
      console.info(`Treating '${address}' read as not-found.`);
      return { code: FetchResultCode.NotFound };
    }

    const content = await ReadableStream.readAll(response.body);

    return {
      code: FetchResultCode.Success,
      content: Buffer.from(content)
    };
  }
}

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
   * @returns The content of of the given address.
   */
  read (address: string): Promise<Buffer>;
}

/**
 * Class that communicates with the underlying CAS using REST API defined by the protocol document.
 */
export class CasClient implements Cas {

  private fetch = nodeFetch;

  /**
   * @param fetchFunction A fetch function compatible with node-fetch's fetch, mainly for mocked fetch for test purposes.
   *                      Typed 'any' unfortunately because it is non-trivial to merge the types defined in @types/fetch-mock with types in @types/node-fetch.
   */
  public constructor (public uri: string, fetchFunction?: any) {
    if (fetchFunction) {
      this.fetch = fetchFunction;
    }
  }

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

  public async read (address: string): Promise<Buffer> {
    // Fetch the resource.
    const queryUri = `${this.uri}/${address}`;
    const response = await this.fetch(queryUri);
    if (response.status !== HttpStatus.OK) {
      console.error(`CAS read error response status: ${response.status}`);
      console.error(`CAS read error body: ${response.body.read()}`);
      throw new Error('Encountered an error reading content from CAS.');
    }

    return Buffer.from(await ReadableStream.readAll(response.body));
  }
}

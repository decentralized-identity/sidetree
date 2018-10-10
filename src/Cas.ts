import * as HttpStatus from 'http-status';
import nodeFetch from 'node-fetch';

/**
 * Interface for accessing the underlying CAS.
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
    const response = await nodeFetch(this.uri, requestParameters);
    if (response.status !== HttpStatus.OK) {
      throw new Error('Encountered an error writing content to CAS.');
    }

    const hash = JSON.parse(response.body.read().toString()).hash;

    return hash;
  }

  public async read (address: string): Promise<Buffer> {
    const queryUri = `${this.uri}/${address}`;
    const response = await nodeFetch(queryUri);
    if (response.status !== HttpStatus.OK) {
      throw new Error('Encountered an error reading content from CAS.');
    }

    const content = response.body.read() as Buffer;

    return content;
  }
}

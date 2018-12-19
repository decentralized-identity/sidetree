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
    // Fetch the resource.
    const queryUri = `${this.uri}/${address}`;
    const response = await nodeFetch(queryUri);
    if (response.status !== HttpStatus.OK) {
      throw new Error('Encountered an error reading content from CAS.');
    }

    // Set callback for the 'readable' event to concatenate chunks of the readable stream.
    let content: string = '';
    response.body.on('readable', () => {
      // NOTE: Cast to any is to work-around incorrect TS definition for read() where
      // `null` should be a possible return type but is not defined in @types/node: 10.12.18.
      let chunk = response.body.read() as any;
      while (chunk !== null) {
        content += chunk;
        chunk = response.body.read();
      }
    });

    // Create a promise to wrap the successful/failed read events.
    const readBody = new Promise((resolve, reject) => {
      response.body.on('end', resolve);
      response.body.on('error', reject);
    });

    // Wait until the response body read is completed.
    await readBody;

    return Buffer.from(content);
  }
}

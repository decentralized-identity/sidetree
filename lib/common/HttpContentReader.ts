import { Headers, Response } from 'node-fetch';
import ReadableStream from './ReadableStream';

/**
 * HttpContentReader utilities
 */
export default class HttpContentReader {

  /**
   * Given a HTTP Response, reads all data until end or error
   * @param response a HTTP Response object
   * @returns a Buffer of the response data
   */
  public static readContent (response: Response): Promise<Buffer> {
    const responseLength = HttpContentReader.getContentLengthFromHeaders(response.headers);
    return ReadableStream.readAll(response.body, responseLength);
  }

  /**
   * Given HTTP Headers, get the "Content-Length" field as a Number or undefined
   * @param headers a HTTP Headers object
   * @returns a Number representing the "Content-Length" header value or undefined
   */
  public static getContentLengthFromHeaders (headers?: Headers): number | undefined {
    if (headers !== undefined) {
      let lengthHeader = headers.get('Content-Length');
      if (lengthHeader !== null) {
        return parseInt(lengthHeader, 10);
      }
    }
    return undefined;
  }

}

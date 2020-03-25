import * as HttpStatus from 'http-status';
import FetchResult from '../common/models/FetchResult';
import FetchResultCode from '../common/enums/FetchResultCode';
import ICas from './interfaces/ICas';
import nodeFetch from 'node-fetch';
import ReadableStream from '../common/ReadableStream';
import ServiceVersionFetcher from './ServiceVersionFetcher';
import ServiceVersionModel from '../common/models/ServiceVersionModel';

/**
 * Class that communicates with the underlying CAS using REST API defined by the protocol document.
 */
export default class Cas implements ICas {

  private fetch = nodeFetch;
  private serviceVersionFetcher: ServiceVersionFetcher;

  public constructor (public uri: string) {
    this.serviceVersionFetcher = new ServiceVersionFetcher(uri);
  }

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

    const body = await ReadableStream.readAll(response.body);
    const hash = JSON.parse(body.toString()).hash;

    return hash;
  }

  public async read (address: string, maxSizeInBytes: number): Promise<FetchResult> {
    try {
      // Fetch the resource.
      const queryUri = `${this.uri}/${address}?max-size=${maxSizeInBytes}`;
      const response = await this.fetch(queryUri);
      if (response.status === HttpStatus.NOT_FOUND) {
        return { code: FetchResultCode.NotFound };
      }

      if (response.status === HttpStatus.BAD_REQUEST) {
        const errorBody = await ReadableStream.readAll(response.body);
        return JSON.parse(errorBody.toString());
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
        content: content
      };
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        return { code: FetchResultCode.CasNotReachable };
      }

      // Else throw
      throw error;
    }
  }

  /**
   * Gets the service version.
   */
  public async getServiceVersion (): Promise<ServiceVersionModel> {
    return this.serviceVersionFetcher.getVersion();
  }
}

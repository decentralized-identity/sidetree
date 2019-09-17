import * as HttpStatus from 'http-status';
import FetchResult from '../common/models/FetchResult';
import ICas from './interfaces/ICas';
import nodeFetch from 'node-fetch';
import ReadableStream from '../common/ReadableStream';
import { FetchResultCode } from '../common/FetchResultCode';
import ServiceVersionModel from '../common/models/ServiceVersionModel';
import Execute from '../common/Execute';
import ServiceInfo from '../common/ServiceInfo';

/**
 * Class that communicates with the underlying CAS using REST API defined by the protocol document.
 */
export default class Cas implements ICas {

  private fetch = nodeFetch;

  private versionUri: string // e.g. https://127.0.0.1/version

  private cachedVersionModel: ServiceVersionModel;

  public constructor (public uri: string) { 
    this.versionUri = `${uri}/version`;
    this.cachedVersionModel = { name: "", version: "" };
  }

  public async initialize() {
    this.cachedVersionModel = await this.tryGetServiceVersion();
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

    const bodyString = await ReadableStream.readAll(response.body);
    const hash = JSON.parse(bodyString).hash;

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

  /**
   * Gets the cached service version.
   */
  public get cachedVersion(): ServiceVersionModel {    
    return this.cachedVersionModel;
  }

  /**
   * Gets the version information by making the REST API call.
   */
  private async tryGetServiceVersion() : Promise<ServiceVersionModel> {
    
    let getServiceFunction = async () => {
      const response = await this.fetch(this.versionUri);

      const responseBodyString = (response.body.read() as Buffer).toString();
      const versionInfo = JSON.parse(responseBodyString);

      return versionInfo;
    }

    return Execute.IgnoreException(getServiceFunction, ServiceInfo.getEmptyServiceVersion());
  }
}

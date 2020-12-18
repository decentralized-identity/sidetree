import Logger from '../common/Logger';
import ReadableStream from '../common/ReadableStream';
import ServiceVersionModel from '../common/models/ServiceVersionModel';
import nodeFetch from 'node-fetch';

/**
 * Encapsulates the functionality of getting the version information from the dependent services.
 */
export default class ServiceVersionFetcher {
  private static readonly fetchWaitTimeInMilliseconds = 600000; // 10 minutes
  private fetch = nodeFetch;
  private cachedVersion: ServiceVersionModel;
  private lastTryFetchTime = 0;

  /**
   * Creates a new instance of this object.
   * @param uri The target service uri which must implement a /version endpoint returning
   * ServiceVersionModel json object.
   */
  public constructor (private uri: string) {
    this.cachedVersion = ServiceVersionFetcher.emptyServiceVersion;
  }

  /**
   * Gets the service version.
   * Returns an 'empty' service version if unable to fetch it.
   */
  public async getVersion (): Promise<ServiceVersionModel> {

    // If the last fetch was more than our threshold, try and refresh the version again
    if (Date.now() - this.lastTryFetchTime > ServiceVersionFetcher.fetchWaitTimeInMilliseconds) {
      this.cachedVersion = await this.tryGetServiceVersion();
    }

    return this.cachedVersion;
  }

  /**
   * Tries to get the version information by making the REST API call. In case of any errors, it ignores
   * any exceptions and returns an 'empty' service version information.
   */
  private async tryGetServiceVersion (): Promise<ServiceVersionModel> {

    try {
      this.lastTryFetchTime = Date.now();

      const versionUri = `${this.uri}/version`;
      Logger.info(`Trying to get the version info from the blockchain service. Url: ${versionUri}`);

      const response = await this.fetch(versionUri);
      const responseBodyBuffer = await ReadableStream.readAll(response.body);

      Logger.info(`Received version response from the blockchain service: ${responseBodyBuffer.toString()}`);

      return JSON.parse(responseBodyBuffer.toString());
    } catch (e) {
      Logger.error(`Ignoring the exception during blockchain service version retrieval: ${JSON.stringify(e, Object.getOwnPropertyNames(e))}`);
    }

    return ServiceVersionFetcher.emptyServiceVersion;
  }

  private static get emptyServiceVersion (): ServiceVersionModel {
    return {
      name: 'undefined',
      version: 'undefined'
    };
  }
}

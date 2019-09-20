import nodeFetch from 'node-fetch';
import ReadableStream from '../common/ReadableStream';
import ServiceInfoProvider from '../common/ServiceInfoProvider';
import ServiceVersionModel from '../common/models/ServiceVersionModel';

/**
 * Encapsulates the functionality of getting the version information from the dependendant services.
 */
export default class ServiceVersionFetcher {
  private static readonly fetchWaitTimeInMilliseconds = 600000; // 10 minutes
  private fetch = nodeFetch;
  private cachedVersion: ServiceVersionModel;
  private lastFetchTime = 0;

  /**
   * Creates a new instance of this object.
   * @param uri The target service uri which must implement a /version endpoint returning
   * ServiceVersionModel json object.
   */
  public constructor (private uri: string) {
    this.cachedVersion = ServiceInfoProvider.emptyServiceVersion;
  }

  /**
   * Gets the service version.
   * Returns `undefined` service version if unable to fetch it.
   */
  public async getVersion (): Promise<ServiceVersionModel> {
    if (this.cachedVersion.version === 'undefined' &&
        Date.now() - this.lastFetchTime > ServiceVersionFetcher.fetchWaitTimeInMilliseconds
    ) {
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
      const versionUri = `${this.uri}/version`;
      console.info('Trying to get the version info from the blockchain service. Url: ', versionUri);

      const response = await this.fetch(versionUri);
      const responseBodyString = await ReadableStream.readAll(response.body);

      this.lastFetchTime = Date.now();
      console.info('Received version response from the blockchain service: ', responseBodyString);

      return JSON.parse(responseBodyString);
    } catch (e) {
      console.error('Ignoring the exception during blockchain service version retrieval: %s', JSON.stringify(e, Object.getOwnPropertyNames(e)));
    }

    return ServiceInfoProvider.emptyServiceVersion;
  }
}

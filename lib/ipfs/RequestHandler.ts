import base64url from 'base64url';
import FetchResultCode from '../common/enums/FetchResultCode';
import IpfsStorage from './IpfsStorage';
import ResponseModel from '../common/models/ResponseModel';
import ResponseStatus from '../common/enums/ResponseStatus';
import ServiceInfo from '../common/ServiceInfoProvider';
import Timeout from './Util/Timeout';

const multihashes = require('multihashes');

/**
 * Sidetree IPFS request handler class.
 */
export default class RequestHandler {
  /**
   * Instance of IpfsStorage.
   */
  public ipfsStorage: IpfsStorage;
  private serviceInfo: ServiceInfo;

  /**
   * Creates and return an instance of Sidetree IPFS request handler.
   * @param fetchTimeoutInSeconds Timeout for fetch request. Fetch request will return `not-found` when timed-out.
   * @param repo Optional IPFS datastore implementation.
   */
  public static create (fetchTimeoutInSeconds: number, repo?: any): RequestHandler {
    return new RequestHandler(fetchTimeoutInSeconds, repo);
  }

  private constructor (private fetchTimeoutInSeconds: number, repo?: any) {
    this.ipfsStorage = new IpfsStorage(repo);
    this.ipfsStorage.initialize();
    this.serviceInfo = new ServiceInfo('ipfs');
  }

  /**
   * Handles read request
   * @param base64urlEncodedMultihash Content Identifier Hash.
   */
  public async handleFetchRequest (base64urlEncodedMultihash: string, maxSizeInBytes?: number): Promise<ResponseModel> {
    console.log(`Handling fetch request for '${base64urlEncodedMultihash}'...`);

    if (maxSizeInBytes === undefined) {
      return {
        status: ResponseStatus.BadRequest,
        body: { code: FetchResultCode.MaxSizeNotSpecified }
      };
    }

    const multihashBuffer = base64url.toBuffer(base64urlEncodedMultihash);
    try {
      multihashes.validate(multihashBuffer);
    } catch {
      return {
        status: ResponseStatus.BadRequest,
        body: { code: FetchResultCode.InvalidHash }
      };
    }

    try {
      const base58EncodedMultihashString = multihashes.toB58String(multihashBuffer);
      const fetchPromise = this.ipfsStorage.read(base58EncodedMultihashString, maxSizeInBytes);

      const fetchResult = await Timeout.timeout(fetchPromise, this.fetchTimeoutInSeconds * 1000);

      // Return not-found if fetch timed.
      if (fetchResult instanceof Error) {
        console.warn(`'${base64urlEncodedMultihash}' not found on IPFS.`);
        return { status: ResponseStatus.NotFound };
      }

      if (fetchResult.code === FetchResultCode.MaxSizeExceeded ||
        fetchResult.code === FetchResultCode.NotAFile) {
        return {
          status: ResponseStatus.BadRequest,
          body: { code: fetchResult.code }
        };
      }

      if (fetchResult.code === FetchResultCode.NotFound) {
        return {
          status: ResponseStatus.NotFound
        };
      }

      // Else fetch was successful.
      console.log(`Fetched '${base64urlEncodedMultihash}' of size ${fetchResult.content!.length} bytes.`);
      return {
        status: ResponseStatus.Succeeded,
        body: fetchResult.content
      };
    } catch (error) {
      console.error(`Hit unexpected error fetching '${base64urlEncodedMultihash}, investigate and fix: ${error}`);
      return {
        status: ResponseStatus.ServerError,
        body: error.message
      };
    }
  }

  /**
   * Handles sidetree content write request
   * @param content Sidetree content to write into CAS storage
   */
  public async handleWriteRequest (content: Buffer): Promise<ResponseModel> {
    console.log(`Writing content of ${content.length} bytes...`);

    let base64urlEncodedMultihash;
    try {
      const base58EncodedMultihashString = await this.ipfsStorage.write(content);
      if (base58EncodedMultihashString === undefined) {
        return {
          status: ResponseStatus.ServerError,
          body: 'ipfs write failed'
        };
      }
      const multihashBuffer = multihashes.fromB58String(base58EncodedMultihashString);
      base64urlEncodedMultihash = base64url.encode(multihashBuffer);

      console.info(`Wrote content '${base64urlEncodedMultihash}'.`);
      return {
        status: ResponseStatus.Succeeded,
        body: { hash: base64urlEncodedMultihash }
      };
    } catch (err) {
      console.error(`Hit unexpected error writing '${base64urlEncodedMultihash}, investigate and fix: ${err}`);
      return {
        status: ResponseStatus.ServerError,
        body: err.message
      };
    }
  }

  /**
   * Handles the get version request.
   */
  public async handleGetVersionRequest (): Promise<ResponseModel> {
    const body = JSON.stringify(this.serviceInfo.getServiceVersion());

    return {
      status : ResponseStatus.Succeeded,
      body : body
    };
  }
}

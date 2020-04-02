import base64url from 'base64url';
import ErrorCode from '../ipfs/ErrorCode';
import FetchResultCode from '../common/enums/FetchResultCode';
import IpfsStorage from './IpfsStorage';
import ResponseModel from '../common/models/ResponseModel';
import ResponseStatus from '../common/enums/ResponseStatus';
import ServiceInfo from '../common/ServiceInfoProvider';
import SidetreeError from '../common/SidetreeError';
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
   * create an instance of request handler
   * @param fetchTimeoutInSeconds Timeout for fetch request. Fetch request will return `not-found` when timed-out.
   * @param repo Optional IPFS datastore implementation.
   */
  public static async create (fetchTimeoutInSeconds: number, repo?: any) {
    let ipfsStorage: IpfsStorage;
    try {
      ipfsStorage = await IpfsStorage.createSingleton(repo);
    } catch (e) {
      if (e instanceof SidetreeError && e.code === ErrorCode.IpfsStorageInstanceCanOnlyBeCreatedOnce) {
        console.debug('IpfsStorage create was called twice, attempting to call get instead: ', JSON.stringify(e, Object.getOwnPropertyNames(e)));
        ipfsStorage = IpfsStorage.getSingleton();
      } else {
        console.error('unexpected error, please investigate and fix: ', JSON.stringify(e, Object.getOwnPropertyNames(e)));
        throw e;
      }
    }
    return new RequestHandler(fetchTimeoutInSeconds, ipfsStorage);
  }

  /**
   * Constructs the Sidetree IPFS request handler.
   * @param fetchTimeoutInSeconds Timeout for fetch request. Fetch request will return `not-found` when timed-out.
   * @param repo Optional IPFS datastore implementation.
   */
  private constructor (private fetchTimeoutInSeconds: number, ipfsStorage: IpfsStorage) {
    this.ipfsStorage = ipfsStorage;
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

    let response: ResponseModel;
    let base64urlEncodedMultihash;
    try {
      const base58EncodedMultihashString = await this.ipfsStorage.write(content);
      const multihashBuffer = multihashes.fromB58String(base58EncodedMultihashString);
      base64urlEncodedMultihash = base64url.encode(multihashBuffer);

      response = {
        status: ResponseStatus.Succeeded,
        body: { hash: base64urlEncodedMultihash }
      };
    } catch (err) {
      response = {
        status: ResponseStatus.ServerError,
        body: err.message
      };
      console.error(`Error writing content: ${err}`);
    }

    console.error(`Wrote content '${base64urlEncodedMultihash}'.`);
    return response;
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

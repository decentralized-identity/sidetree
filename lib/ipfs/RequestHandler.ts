import base64url from 'base64url';
import IpfsStorage from './IpfsStorage';
import { FetchResultCode } from '../common/FetchResultCode';
import { IResponse, ResponseStatus } from '../common/Response';
import { Timeout } from './Util/Timeout';
const multihashes = require('multihashes');

/**
 * Sidetree IPFS request handler class.
 */
export default class RequestHandler {
  /**
   * Instance of IpfsStorage.
   */
  public ipfsStorage: IpfsStorage;

  /**
   * Constructs the Sidetree IPFS request handler.
   * @param fetchTimeoutInSeconds Timeout for fetch request. Fetch request will return `not-found` when timed-out.
   * @param repo Optional IPFS datastore implementation.
   */
  public constructor (private fetchTimeoutInSeconds: number, repo?: any) {
    this.ipfsStorage = IpfsStorage.create(repo);
  }

  /**
   * Handles read request
   * @param base64urlEncodedMultihash Content Identifier Hash.
   */
  public async handleFetchRequest (base64urlEncodedMultihash: string, maxSizeInBytes?: number): Promise<IResponse> {
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
      const fetchPromsie = this.ipfsStorage.read(base58EncodedMultihashString, maxSizeInBytes);

      const fetchResult = await Timeout.timeout(fetchPromsie, this.fetchTimeoutInSeconds * 1000);

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
  public async handleWriteRequest (content: Buffer): Promise<IResponse> {
    console.log(`Writing content of ${content.length} bytes...`);

    let response: IResponse;
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
}

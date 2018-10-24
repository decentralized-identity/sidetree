import { Response, ResponseStatus } from './Response';
import { IpfsStorage } from './lib/IpfsStorage';
import * as Ipfs from 'ipfs';
const multihashes = require('multihashes');

/**
 * Sidetree IPFS request handler class
 */
export default class RequestHandler {

  /**
   * Instance of IpfsStorage.
   */
  public ipfsStorage: IpfsStorage;

  public constructor (ipfsOptions: Ipfs.Options) {
    this.ipfsStorage = IpfsStorage.create(ipfsOptions);
  }
  /**
   * Handles read request
   * @param hash Content Identifier Hash.
   */
  public async handleFetchRequest (hash: string): Promise<Response> {
    const decodedHash = multihashes.fromB58String(hash);
    let response: Response;
    try {
      multihashes.validate(decodedHash);
    } catch {
      return {
        status: ResponseStatus.BadRequest,
        body: { error: 'Invalid content Hash' }
      };
    }
    try {
      const content = await this.ipfsStorage.read(hash);
      response = {
        status: ResponseStatus.Succeeded,
        body: content
      };
    } catch (err) {
      response = {
        status: ResponseStatus.ServerError,
        body: err.message
      };
    }
    return response;
  }

  /**
   * Handles sidetree content write request
   * @param content Sidetree content to write into CAS storage
   */
  public async handleWriteRequest (content: Buffer): Promise<Response> {
    let response: Response;
    try {
      const contentHash = await this.ipfsStorage.write(content);
      response = {
        status: ResponseStatus.Succeeded,
        body: { hash: contentHash }
      };
    } catch (err) {
      response = {
        status: ResponseStatus.ServerError,
        body: err.message
      };
    }
    return response;
  }
}

import { Response, ResponseStatus } from './Response';
import { IpfsStorage } from './lib/IPFSStorage';
const multihashes = require('multihashes');

/**
 * Sidetree IPFS request handler class
 */
export default class RequestHandler {

  private ipfsStorage: IpfsStorage;

  public constructor () {
    this.ipfsStorage = IpfsStorage.createIPFSNode();
  }
  /**
   * Handles read request
   * @param _hash Content Identifier Hash.
   */
  public async handleFetchRequest (_hash: string): Promise<Response> {
    const multihash = Buffer.from(_hash);
    let response!: Response;
    try {
      multihashes.validate(multihash);
    } catch {
      return {
        status: ResponseStatus.BadRequest,
        body: { error: 'Invalid content Hash' }
      };
    }
    try {
      await this.ipfsStorage.read(_hash).then((value) => {
        response = {
          status: ResponseStatus.Succeeded,
          body: value
        };
      });
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
    let response!: Response;
    try {
      await this.ipfsStorage.write(content).then((value) => {
        response = {
          status: ResponseStatus.Succeeded,
          body: { hash: value }
        };
      });
    } catch (err) {
      response = {
        status: ResponseStatus.ServerError,
        body: err.message
      };
    }
    return response;
  }
}

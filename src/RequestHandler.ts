import { Response, ResponseStatus } from './Response';

/**
 * Sidetree Bitcoin request handler class
 */
export default class RequestHandler {

  /**
   * Handles sidetree transaction anchor request
   * @param tx Sidetree transaction to write into the underlying
   */

  public async handleAnchorRequest (tx: string): Promise<Response> {
    let response: Response;
    try {
      // const contentHash = await this.ipfsStorage.write(tx);
      response = {
        status: ResponseStatus.Succeeded,
        body: { hash: tx }
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

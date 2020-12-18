import IOperationQueue from '../../../../lib/core/versions/latest/interfaces/IOperationQueue';
import IRequestHandler from '../../../../lib/core/interfaces/IRequestHandler';
import Resolver from '../../../../lib/core/Resolver';
import ResponseModel from '../../../../lib/common/models/ResponseModel';

/**
 * Request handler.
 */
export default class RequestHandler implements IRequestHandler {

  public constructor (
    private resolver: Resolver,
    private operationQueue: IOperationQueue,
    private didMethodName: string) {
    console.info(this.resolver, this.operationQueue, this.didMethodName);
  }

  async handleOperationRequest (request: Buffer): Promise<ResponseModel> {
    throw new Error(`RequestHandler: Not implemented. Version: TestVersion1. Inputs: ${request}`);
  }

  async handleResolveRequest (didOrDidDocument: string): Promise<ResponseModel> {
    throw new Error(`RequestHandler: Not implemented. Version: TestVersion1. Inputs: ${didOrDidDocument}`);
  }
}

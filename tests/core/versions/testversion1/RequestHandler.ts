import IOperationQueue from '../../../../lib/core/versions/latest/interfaces/IOperationQueue';
import Resolver from '../../../../lib/core/Resolver';

/**
 * Request handler.
 */
export default class RequestHandler {

  // tslint:disable-next-line: max-line-length
  public constructor (private resolver: Resolver, private operationQueue: IOperationQueue, private didMethodName: string, private supportedAlgorithms: number[]) {
    console.debug(this.resolver, this.operationQueue, this.didMethodName, this.supportedAlgorithms);
  }
}

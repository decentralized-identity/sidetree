import MockOperationQueue from '../../../mocks/MockOperationQueue';

/**
 * Some documentation
 */
export default class MongoDbOperationQueue extends MockOperationQueue {

  public constructor (private connectionString: string) {
    super();

    console.debug('Making typescript ', this.connectionString);
  }

  /**
   * Initialize.
   */
  // tslint:disable-next-line: no-empty
  public initialize () { }

  async enqueue (didUniqueSuffix: string, operationBuffer: Buffer) {
    throw new Error(`MongoDbOperationQueue: Not implemented. Version: TestVersion1. Inputs: ${didUniqueSuffix}, ${operationBuffer}`);
  }
}

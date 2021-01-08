import MockOperationQueue from '../../../mocks/MockOperationQueue';

/**
 * Some documentation
 */
export default class MongoDbOperationQueue extends MockOperationQueue {

  public constructor (private connectionString: string) {
    super();

    console.info('Making typescript ', this.connectionString);
  }

  /**
   * Initialize.
   */
  public initialize () { }

  async enqueue (didUniqueSuffix: string, operationBuffer: Buffer) {
    throw new Error(`MongoDbOperationQueue: Not implemented. Version: TestVersion1. Inputs: ${didUniqueSuffix}, ${operationBuffer}`);
  }
}

import MockOperationQueue from '../../../mocks/MockOperationQueue';

/**
 * Some documentation
 */
export default class MongoDbOperationQueue extends MockOperationQueue {

  public static classInstantiatedCount: number = 0;

  public constructor (private connectionString: string) {
    super();
    MongoDbOperationQueue.classInstantiatedCount++;

    console.debug('Making typescript ', this.connectionString);
  }

  /**
   * Initialize.
   */
  // tslint:disable-next-line: no-empty
  public initialize () { }
}

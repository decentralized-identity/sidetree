import Transaction from '../../src/Transaction';
import { DidCache } from '../../src/DidCache';
import { WriteOperation } from '../../src/Operation';

/**
 * Mock DID cache class for testing.
 */
export default class MockDidCache implements DidCache {
  public get lastProcessedTransaction (): Transaction | undefined {
    return undefined;
  }

  public apply (_operation: WriteOperation): void {
    return;
  }
}

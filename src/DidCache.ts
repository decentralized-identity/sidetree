import Transaction from './Transaction';
import { WriteOperation } from './Operation';

/**
 * Interface for caching all the processed DIDs and related states.
 * This interface is mainly useful for creating a mock instances for testing purposes.
 */
export interface DidCache {
  /** The transaction that was COMPLETELY processed. */
  readonly lastProcessedTransaction?: Transaction;

  apply (operation: WriteOperation): void;
}

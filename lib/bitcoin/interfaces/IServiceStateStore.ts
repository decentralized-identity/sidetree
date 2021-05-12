/**
 * An abstraction for the persistence of service state.
 */
export default interface IServiceStateStore<T> {

  /**
   * Upserts the given service state to the store.
   */
  put (serviceState: T): Promise<void>;

  /**
   * Gets the service state.
   */
  get (): Promise<T>;
}

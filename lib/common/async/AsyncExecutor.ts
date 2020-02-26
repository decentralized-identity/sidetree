import AsyncTimeoutError from './AsyncTimeoutError';

/**
 * utility class to help time out an async function
 */
export default class AsyncExecutor {

  /**
   * Set a timeout on async function. Throws AsyncTimeoutError when async call times out
   * @param asyncCall the async call to timeout on
   * @param timeOutInMilliseconds how long to wait for
   */
  public static async executeWithTimeout<T> (asyncCall: Promise<T>, timeOutInMilliseconds: number): Promise<T> {
    // remember the timeout so it can be stopped later;
    let timeoutReference: NodeJS.Timeout;

    // create a promise to reject and throw on timeout
    const startTiming = new Promise((_resolve, reject) => {
      timeoutReference = setTimeout(() => {
        reject(new AsyncTimeoutError('Async call timed out'));
      }, timeOutInMilliseconds);
    });

    // race between the timeout and async call to see which one returns first
    return Promise.race([startTiming, asyncCall])
      .then((res) => {
        // if resolved, clear the timeout and return
        clearTimeout(timeoutReference);
        return res;
      }).catch((e) => {
        // clear timeout before throwing just in case the error is thrown by the async call
        clearTimeout(timeoutReference);
        throw e;
      }) as Promise<T>;
  }
}

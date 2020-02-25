/**
 * utility class to help time out an async function
 */
export default class AsyncTimeout {

  /**
   * Set a timeout on async function
   * @param asyncCall the async call to timeout on
   * @param timeOutInMilliseconds how long to wait for
   */
  public static async timeoutAsyncCall (asyncCall: Promise<any>, timeOutInMilliseconds: number): Promise<AsyncTimeoutResult> {
    // remember the timeout so it can be stopped later;
    let timeoutReference: NodeJS.Timeout;

    // create a promise to reject and throw on timeout
    const startTiming = new Promise((_resolve, reject) => {
      timeoutReference = setTimeout(() => {
        reject(new TimeoutError('Async call timed out'));
      }, timeOutInMilliseconds);
    });

    // race between the timeout and async call to see which one returns first
    return Promise.race([startTiming, asyncCall])
      .then((res) => {
        // if resolved, clear the timeout and return
        clearTimeout(timeoutReference);
        return { timedOut: false, result: res };
      }).catch((e) => {
        clearTimeout(timeoutReference);
        // if thrown, determine if it's a timeout error or async call threw and error
        if (e instanceof TimeoutError) {
          return { timedOut: true, result: undefined };
        }
        throw e;
      });
  }
}

// this is used to differentiate timeout from other errors
class TimeoutError extends Error {}

// model for the return of the timeoutAsuncCall function
interface AsyncTimeoutResult {
  timedOut: boolean;
  result: any;
}

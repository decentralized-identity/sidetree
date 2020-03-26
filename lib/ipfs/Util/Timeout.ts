/**
 * Class containing code execution timeout/timing utilities.
 */
export default class Timeout {

  /**
   * Monitors the given promise to see if it runs to completion within the specified timeout duration.
   * @param task Promise to apply a timeout to.
   * @returns The given promise if it completed execution within the timeout duration, a promise containing an Error otherwise.
   */
  public static async timeout<T> (task: Promise<T>, timeoutInMilliseconds: number): Promise<T | Error> {
    const timeoutPromise = new Promise<Error>((resolve, _reject) => {
      setTimeout(() => {
        resolve(new Error(`The given promised timed out after ${timeoutInMilliseconds} milliseconds.`));
      }, timeoutInMilliseconds);
    });

    const content = await Promise.race([task, timeoutPromise]);
    return content;
  }
}

import IpfsErrorCode from '../IpfsErrorCode';
import SidetreeError from '../../common/SidetreeError';

/**
 * Class containing code execution timeout/timing utilities.
 */
export default class Timeout {

  /**
   * Monitors the given promise to see if it runs to completion within the specified timeout duration.
   * @param task Promise to apply a timeout to.
   * @returns The value that the task returns if the task completed execution within the timeout duration.
   * @throws `TimeoutPromiseTimedOut` Error task timed out. Rethrows the error that the given task throws.
   */
  public static async timeout<T> (task: Promise<T>, timeoutInMilliseconds: number): Promise<T> {
    // eslint-disable-next-line promise/param-names
    const timeoutPromise = new Promise<T>((_resolve, reject) => {
      setTimeout(
        () => { reject(new SidetreeError(IpfsErrorCode.TimeoutPromiseTimedOut, `Promise timed out after ${timeoutInMilliseconds} milliseconds.`)); },
        timeoutInMilliseconds
      );
    });

    const content = await Promise.race([task, timeoutPromise]);

    return content;
  }
}

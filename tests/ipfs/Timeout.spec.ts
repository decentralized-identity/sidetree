import IpfsErrorCode from '../../lib/ipfs/IpfsErrorCode';
import JasmineSidetreeErrorValidator from '../JasmineSidetreeErrorValidator';
import Timeout from '../../lib/ipfs/Util/Timeout';

describe('Timeout', async () => {
  describe('timeout()', async () => {
    it('should timeout if given task took too long.', async (done) => {
      // A 10 second running promise.
      const longRunningPromise = new Promise<number>((resolve) => {
        setTimeout(
          () => { resolve(1); },
          10);
      });

      await JasmineSidetreeErrorValidator.expectSidetreeErrorToBeThrownAsync(
        () => Timeout.timeout(longRunningPromise, 1),
        IpfsErrorCode.TimeoutPromiseTimedOut
      );

      done();
    });

    it('should return error thrown by the task.', async (done) => {
      const error = new Error('some bad error');
      const aPromiseThatThrowsError = new Promise(() => {
        throw error;
      });

      await expectAsync(Timeout.timeout(aPromiseThatThrowsError, 1000)).toBeRejected(error);
      done();
    });
  });
});

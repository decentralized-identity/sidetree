import IpfsErrorCode from '../../lib/ipfs/IpfsErrorCode';
import Timeout from '../../lib/ipfs/Util/Timeout';

describe('Tmeout', async () => {
  describe('timeout()', async () => {
    it('should timeout if given task took too long.', async () => {
      // A 10 second running promise.
      const longRunningPromsie = new Promise<number>((resolve, _reject) => {
        setTimeout(
          () => { resolve(1); },
          10);
      });

      const taskResult = await Timeout.timeout(longRunningPromsie, 1);
      
      expect((taskResult as any).code).toEqual(IpfsErrorCode.TimeoutPromiseTimedOut);
    });

    it('should return error thrown by the task', async () => {
      const aPromiseThatThrowsError = new Promise((_resolve, _reject) => {
        throw new Error('some bad error');
      });

      const taskResult = await Timeout.timeout(aPromiseThatThrowsError, 1);
      expect((taskResult as any).message).toEqual('some bad error');
    });
  });
});

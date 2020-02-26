import AsyncExecutor from '../../lib/common/async/AsyncExecutor';
import AsyncTimeoutError from '../../lib/common/async/AsyncTimeoutError';

describe('AsyncExecutor', () => {
  it('should time out if async call takes more time than timeout limit', async () => {
    const aLongTime = 9999;
    const longWait = new Promise((resolve) => setTimeout(() => {
      resolve('this should not execute because it times out');
    }, aLongTime));

    const timeoutDuration = 100;
    try {
      await AsyncExecutor.executeWithTimeout(longWait, timeoutDuration);
      fail('should throw in test but did not');
    } catch (e) {
      expect(e.message).toEqual('Async call timed out');
      expect(e instanceof AsyncTimeoutError).toBeTruthy();
    }
  });

  it('should return expected result if async call takes less time than timeout limit', async () => {
    const aShortTime = 10;
    const shortWait = new Promise((resolve) => setTimeout(() => {
      resolve('this should be returned because the wait is short');
    }, aShortTime));

    const timeoutDuration = 100;
    const result = await AsyncExecutor.executeWithTimeout(shortWait, timeoutDuration);

    const expected = 'this should be returned because the wait is short';
    expect(result).toEqual(expected);
  });

  it('should throw error if the async call throws error', async () => {
    const aShortTime = 10;
    const shortWait = new Promise((_resolve, reject) => setTimeout(() => {
      reject(new Error('Failed, which is expected'));
    }, aShortTime));

    const timeoutDuration = 100;
    try {
      await AsyncExecutor.executeWithTimeout(shortWait, timeoutDuration);
      fail('Test should throw but did not');
    } catch (e) {
      expect(e.message).toEqual('Failed, which is expected');
    }
  });
});

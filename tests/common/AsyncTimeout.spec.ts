import AsyncTimeout from '../../lib/common/AsyncTimeout';

describe('AsyncTimeout', () => {
  it('should time out if async call takes more time than timeout limit', async () => {
    const aLongTime = 9999;
    const longWait = new Promise((resolve) => setTimeout(() => {
      resolve('this should not execute because it times out');
    }, aLongTime));

    const timeoutDuration = 100;
    const result = await AsyncTimeout.timeoutAsyncCall(longWait, timeoutDuration);

    const expected = { timedOut: true, result: undefined };
    expect(result).toEqual(expected);
  });

  it('should return expected result if async call takes less time than timeout limit', async () => {
    const aShortTime = 10;
    const shortWait = new Promise((resolve) => setTimeout(() => {
      resolve('this should be returned because the wait is short');
    }, aShortTime));

    const timeoutDuration = 100;
    const result = await AsyncTimeout.timeoutAsyncCall(shortWait, timeoutDuration);

    const expected = { timedOut: false, result: 'this should be returned because the wait is short' };
    expect(result).toEqual(expected);
  });

  it('should throw error if the async call throws error', async () => {
    const aShortTime = 10;
    const shortWait = new Promise((_resolve, reject) => setTimeout(() => {
      reject(new Error('Failed, which is expected'));
    }, aShortTime));

    const timeoutDuration = 100;
    try {
      await AsyncTimeout.timeoutAsyncCall(shortWait, timeoutDuration);
      expect('expect to throw').toEqual('but did not throw');
    } catch (e) {
      expect(e.message).toEqual('Failed, which is expected');
    }
  });
});

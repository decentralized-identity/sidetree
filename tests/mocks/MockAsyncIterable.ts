/**
 * mock class for async iterable
 */
export default class MockAsyncIterable implements AsyncIterator<any>, AsyncIterable<any> {

  private doneValue = {
    value: undefined,
    done: true
  };

  private notDoneValue = {
    value: undefined,
    done: false
  };

  private indexTracker = {
    numOfElements: Number.MAX_SAFE_INTEGER,
    currentIndex: 0
  };

  public constructor (doneValue?: any, notDoneValue?: any, numOfElements?: number) {
    this.doneValue.value = doneValue;
    this.notDoneValue.value = notDoneValue;
    if (numOfElements !== undefined) {
      this.indexTracker.numOfElements = numOfElements;
    }
  }

  /**
   * yields the next element. Based on arg, the test can control what to return.
   * If the first argument is 'notDone', then it will yield mockIteratorYieldResult,
   * otherwise mockIteratorReturnResult
   */
  public next (...args: [] | [undefined]): Promise<IteratorResult<any>> {
    if (args[0] && args[0] === 'notDone') {
      return new Promise((resolve) => {
        resolve(this.notDoneValue);
      });
    }

    return new Promise((resolve) => {
      resolve(this.doneValue);
    });
  }

  /**
   * iterator function of an iterable
   */
  public [Symbol.asyncIterator] (): AsyncIterator<any> {
    const notDoneValue = this.notDoneValue;
    const indexTracker = this.indexTracker;
    const doneValue = this.doneValue;
    return {
      next () {
        if (indexTracker.currentIndex < indexTracker.numOfElements) {
          indexTracker.currentIndex++;
          return Promise.resolve(notDoneValue);
        }
        return Promise.resolve(doneValue);
      }
    };
  }
}

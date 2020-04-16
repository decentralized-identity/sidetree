import RequestError from '../../lib/bitcoin/RequestError';
import ResponseStatus from '../../lib/common/enums/ResponseStatus';

describe('RquestError', () => {
  describe('expose', () => {
    it('should return true if the code is defined', () => {
      const requestError = new RequestError(ResponseStatus.BadRequest, 'some code');
      expect(requestError.expose).toBeTruthy();
    });

    it('should return false if the code is defined', () => {
      const requestError = new RequestError(ResponseStatus.BadRequest, undefined);
      expect(requestError.expose).toBeFalsy();
    });
  });
});

import Response, { ResponseStatus } from '../../lib/common/Response';

describe('Response', () => {

  it('should return 500 as HTTP status code if ResponseStatus is ServerError.', async () => {
    const httpStatusCode = Response.toHttpStatus(ResponseStatus.ServerError);
    expect(httpStatusCode).toEqual(500);
  });
});

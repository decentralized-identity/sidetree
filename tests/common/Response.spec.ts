import Response from '../../lib/common/Response';
import ResponseStatus from '../../lib/common/enums/ResponseStatus';

describe('Response', () => {

  it('should return 500 as HTTP status code if ResponseStatus is ServerError.', async () => {
    const httpStatusCode = Response.toHttpStatus(ResponseStatus.ServerError);
    expect(httpStatusCode).toEqual(500);
  });
});

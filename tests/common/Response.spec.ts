import Response from '../../lib/common/Response';
import ResponseStatus from '../../lib/common/enums/ResponseStatus';

describe('Response', () => {
  it('should return 200 as HTTP status code if ResponseStatus is Success.', () => {
    const httpStatusCode = Response.toHttpStatus(ResponseStatus.Succeeded);
    expect(httpStatusCode).toEqual(200);
  });

  it('should return 400 as HTTP status code if ResponseStatus is Bad Request.', () => {
    const httpStatusCode = Response.toHttpStatus(ResponseStatus.BadRequest);
    expect(httpStatusCode).toEqual(400);
  });

  it('should return 410 as HTTP status code if ResponseStatus is Deactivated.', () => {
    const httpStatusCode = Response.toHttpStatus(ResponseStatus.Deactivated);
    expect(httpStatusCode).toEqual(410);
  });

  it('should return 404 as HTTP status code if ResponseStatus is Not Found.', () => {
    const httpStatusCode = Response.toHttpStatus(ResponseStatus.NotFound);
    expect(httpStatusCode).toEqual(404);
  });

  it('should return 500 as HTTP status code if ResponseStatus is ServerError.', async () => {
    const httpStatusCode = Response.toHttpStatus(ResponseStatus.ServerError);
    expect(httpStatusCode).toEqual(500);
  });
});

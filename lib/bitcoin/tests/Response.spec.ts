import Response, { ResponseStatus } from '../lib/Response';

describe('Response', () => {

  it('should return the success response code.', () => {
    const expectedResponse: number = 200;
    let fetchedResponse = Response.toHttpStatus(ResponseStatus.Succeeded);

    expect(expectedResponse).toEqual(fetchedResponse);
  });

  it('should return the bad request response code.', () => {
    const expectedResponse: number = 400;
    let fetchedResponse = Response.toHttpStatus(ResponseStatus.BadRequest);

    expect(expectedResponse).toEqual(fetchedResponse);
  });

  it('should return the server error response code.', () => {
    const expectedResponse: number = 500;
    let fetchedResponse = Response.toHttpStatus(ResponseStatus.ServerError);

    expect(expectedResponse).toEqual(fetchedResponse);
  });
});

import { ResponseStatus, toHttpStatus } from '../src/Response';

describe('Response', () => {

  it('should return the success response code.', () => {
    const expectedResponse: number = 200;
    let fetchedResponse = toHttpStatus(ResponseStatus.Succeeded);

    expect(expectedResponse).toEqual(fetchedResponse);
  });

  it('should return the bad request response code.', () => {
    const expectedResponse: number = 400;
    let fetchedResponse = toHttpStatus(ResponseStatus.BadRequest);

    expect(expectedResponse).toEqual(fetchedResponse);
  });

  it('should return the server error response code.', () => {
    const expectedResponse: number = 500;
    let fetchedResponse = toHttpStatus(ResponseStatus.ServerError);

    expect(expectedResponse).toEqual(fetchedResponse);
  });
});

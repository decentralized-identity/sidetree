import * as RequestHandler from '../src/RequestHandler';
import { Response, ResponseStatus } from '../src/Response';

describe('RequestHandler', () => {

  it('should return the correct response object for fetch request.', () => {
    const expectedResponse: Response = {
      status: ResponseStatus.ServerError,
      body: { error: 'Not implemented' }
    };
    let testHash: string = '123abc';
    let fetchedResponse = RequestHandler.handleFetchRequest(testHash);

    expect(expectedResponse).toEqual(fetchedResponse);
  });
});
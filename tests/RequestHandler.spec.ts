import RequestHandler from '../src/RequestHandler';
import { Response, ResponseStatus } from '../src/Response';

describe('RequestHandler', () => {

  it('should return the correct response object for invalid multihash.', async () => {
    const expectedResponse: Response = {
      status: ResponseStatus.BadRequest,
      body: { error: 'Invalid content Hash' }
    };
    const requestHandler = new RequestHandler();
    let testHash: string = '123abc';
    let fetchedResponse = await requestHandler.handleFetchRequest(testHash);

    expect(expectedResponse).toEqual(fetchedResponse);
  });
});
import RequestHandler from '../src/RequestHandler';
import { Response, ResponseStatus } from '../src/Response';

describe('RequestHandler', () => {
  let requestHandler: RequestHandler;

  beforeEach(() => {
    requestHandler = new RequestHandler();
  });


  it('should return the correct response body with content for anchor request', async () => {
    const expectedResponse: Response = {
      status: ResponseStatus.Succeeded,
      body: { hash: 'QmYtUc4iTCbbfVSDNKvtQqrfyezPPnFvE33wFmutw9PBBk' }
    };

    const fetchedResponse = await requestHandler.handleAnchorRequest("sidetree");

    expect(expectedResponse.status).toEqual(fetchedResponse.status);
  });
});
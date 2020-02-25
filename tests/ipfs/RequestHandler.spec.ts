import FetchResultCode from '../../lib/common/FetchResultCode';
import RequestHandler from '../../lib/ipfs/RequestHandler';
import ServiceVersionModel from '../../lib/common/models/ServiceVersionModel';
import { Response, ResponseStatus } from '../../lib/common/Response';

describe('RequestHandler', () => {
  let maxFileSize: number;
  let fetchTimeoutInSeconds: number;
  let requestHandler: RequestHandler;

  beforeAll(async (done) => {
    console.log('BEGINNING OF BEFORE ALL!!!!!!');
    try {
      maxFileSize = 20000000; // 20MB
      fetchTimeoutInSeconds = 1;
      requestHandler = await RequestHandler.create(fetchTimeoutInSeconds);
    } catch (e) {
      console.log(`${JSON.stringify(e, Object.getOwnPropertyNames(e))}`);
    }
    console.log('END OF BEFORE ALL!!!!!!');
    done();
  });

  afterAll(async () => {
    await requestHandler.ipfsStorage.stop();
  });

  it('should return the correct response object for invalid multihash for fetch request.', async () => {
    console.log('IN FIRST TEST!!!!!!');
    const expectedResponse: Response = {
      status: ResponseStatus.BadRequest,
      body: { code: FetchResultCode.InvalidHash }
    };

    const testSidetreeHash: string = '123abc';
    const fetchedResponse = await requestHandler.handleFetchRequest(testSidetreeHash, maxFileSize);

    expect(expectedResponse).toEqual(fetchedResponse);
  });

  it('should return the correct response body with content for fetch request', async () => {
    const expectedResponse: Response = {
      status: ResponseStatus.Succeeded,
      body: Buffer.from('dummyContent')
    };
    const testSidetreeHash: string = 'EiCcvAfD-ZFyWDajqipYHKICkZiqQgudmbwOEx2fPiy-Rw';
    spyOn(requestHandler.ipfsStorage, 'read').and.returnValue(Promise.resolve({ code: FetchResultCode.Success, content: Buffer.from('dummyContent') }));

    const fetchedResponse = await requestHandler.handleFetchRequest(testSidetreeHash, maxFileSize);

    expect(expectedResponse).toEqual(fetchedResponse);
  });

  it('should return the correct response body with content for write request', async () => {
    const expectedResponse: Response = {
      status: ResponseStatus.Succeeded,
      body: { hash: 'EiCcvAfD-ZFyWDajqipYHKICkZiqQgudmbwOEx2fPiy-Rw' }
    };

    // Mock the IPFS storage layer to return a Base58 encoded multihash regardless of content written.
    spyOn(requestHandler.ipfsStorage, 'write').and.returnValue(Promise.resolve('QmYtUc4iTCbbfVSDNKvtQqrfyezPPnFvE33wFmutw9PBBk'));
    const mockSidetreeContent: Buffer = Buffer.from('dummyContent');

    const fetchedResponse = await requestHandler.handleWriteRequest(mockSidetreeContent);

    expect(expectedResponse).toEqual(fetchedResponse);
  });

  it('should return the correct response body for the version request', async () => {
    const expectedVersion: ServiceVersionModel = {
      name: 'test-service',
      version: 'x.y.z'
    };

    const expectedResponse = {
      status: ResponseStatus.Succeeded,
      body: JSON.stringify(expectedVersion)
    };

    // Make the handle service version call return the test value
    spyOn(requestHandler['serviceInfo'], 'getServiceVersion').and.returnValue(expectedVersion);

    const fetchedResponse = await requestHandler.handleGetVersionRequest();

    expect(fetchedResponse).toEqual(expectedResponse);
  });
});
